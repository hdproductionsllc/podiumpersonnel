/**
 * POST /api/repertoire/add-work — create (or extend) a library work from
 * manually uploaded part PDFs, after the browser has PUT them to R2.
 *
 * Fidelity rules (the owner has been burned before — same bar as Phase A):
 *  - Every claimed object is re-downloaded and sha256-hashed HERE, server-side,
 *    and must equal the hash in its content-addressed key. A mismatched object
 *    is deleted and the request rejected — a corrupt/forged upload can never
 *    become a library row.
 *  - Original filenames are preserved verbatim in original_filename.
 *
 * Dedupe follows 068's identity key (org, norm_title, artist, ensemble): if the
 * work already exists, parts are ADDED to it (duplicates of an existing part
 * role are skipped, never overwritten) and the existing work is returned — so
 * "add to library" from an intake row can safely double as "locate".
 *
 * Security: org from the admin's membership. Storage paths are derived
 * server-side from org + sha; the client never supplies a path.
 */

import { createHash } from 'crypto'
import { requireIntakeEnabled, apiError, apiSuccess, serverError } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'
import { getR2Client, isR2Configured } from '@/lib/storage/r2'
import { normTitle } from '@/lib/intake/normalize'
import { PART_KEYS } from '@/lib/intake/part-guess'

const ENSEMBLES = new Set(['quartet', 'quintet', 'trio', 'viola-trio', 'duo', 'solo', 'other'])
const MAX_PARTS = 20

interface IncomingPart {
  part?: unknown
  sha256?: unknown
  bytes?: unknown
  originalFilename?: unknown
}

export async function POST(request: Request) {
  const { membership, error } = await requireIntakeEnabled()
  if (error || !membership) return error!
  const orgId = membership.organization_id

  if (!isR2Configured()) {
    return apiError('File storage is not configured on this server.', 503)
  }

  let body: { title?: unknown; artist?: unknown; ensemble?: unknown; parts?: unknown }
  try {
    body = await request.json()
  } catch {
    return apiError('Invalid JSON body', 400)
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return apiError('A title is required.', 400)
  const norm = normTitle(title)
  if (!norm) return apiError('The title has no matchable characters.', 400)

  const artist = typeof body.artist === 'string' && body.artist.trim() ? body.artist.trim() : null

  const ensemble = typeof body.ensemble === 'string' ? body.ensemble : ''
  if (!ENSEMBLES.has(ensemble)) {
    return apiError(`ensemble must be one of: ${[...ENSEMBLES].join(', ')}.`, 400)
  }

  const partsInput: IncomingPart[] = Array.isArray(body.parts) ? (body.parts as IncomingPart[]) : []
  if (partsInput.length === 0 || partsInput.length > MAX_PARTS) {
    return apiError(`Between 1 and ${MAX_PARTS} part files are required.`, 400)
  }

  try {
    // Validate every part BEFORE touching storage or the DB.
    const parts = partsInput.map((p, i) => {
      const part = typeof p.part === 'string' ? p.part : ''
      const sha256 = typeof p.sha256 === 'string' ? p.sha256.toLowerCase() : ''
      const bytes = typeof p.bytes === 'number' ? p.bytes : NaN
      const originalFilename = typeof p.originalFilename === 'string' ? p.originalFilename : ''
      if (!PART_KEYS.has(part)) throw apiValidation(`Part ${i + 1}: unknown part role "${part}".`)
      if (!/^[0-9a-f]{64}$/.test(sha256)) throw apiValidation(`Part ${i + 1}: invalid sha256.`)
      if (!Number.isInteger(bytes) || bytes <= 0) throw apiValidation(`Part ${i + 1}: invalid byte size.`)
      if (!originalFilename.trim()) throw apiValidation(`Part ${i + 1}: original filename is required.`)
      return {
        part,
        sha256,
        bytes,
        originalFilename,
        storagePath: `repertoire/${orgId}/${sha256}.pdf`, // server-derived, never client-supplied
      }
    })

    const r2 = getR2Client()

    // FIDELITY GATE: every object must exist, match its claimed size, and hash
    // back to the sha in its own key. Downloaded and hashed server-side.
    for (const p of parts) {
      const head = await r2.headObject(p.storagePath)
      if (!head) {
        return apiError(`"${p.originalFilename}" was not found in storage — upload it first.`, 400)
      }
      if (head.size !== p.bytes) {
        return apiError(
          `"${p.originalFilename}": stored size (${head.size}) doesn't match the upload (${p.bytes}).`,
          400
        )
      }
      const stored = await r2.getRange(p.storagePath, head.size)
      const actual = createHash('sha256').update(stored).digest('hex')
      if (actual !== p.sha256) {
        // The object at this key is corrupt for everyone — remove it.
        await r2.deleteObject(p.storagePath)
        return apiError(
          `"${p.originalFilename}" failed integrity verification and was removed. Please upload it again.`,
          400
        )
      }
    }

    const service = createServiceClient()

    // Dedupe on 068's identity key: (org, norm_title, coalesce(artist,''), ensemble).
    const { data: sameTitle, error: findErr } = await service
      .from('repertoire')
      .select('id,title,artist,ensemble')
      .eq('organization_id', orgId)
      .eq('norm_title', norm)
      .eq('ensemble', ensemble)
    if (findErr) return serverError('repertoire: find existing work', findErr)

    const existing = (sameTitle ?? []).find((w) => (w.artist ?? '') === (artist ?? ''))

    let workId: string
    let existed = false
    if (existing) {
      workId = existing.id as string
      existed = true
    } else {
      const { data: created, error: insErr } = await service
        .from('repertoire')
        .insert({
          organization_id: orgId,
          title,
          artist,
          ensemble,
          norm_title: norm,
        })
        .select('id')
        .single()
      if (insErr || !created) return serverError('repertoire: insert work', insErr ?? new Error('no row'))
      workId = created.id as string
    }

    // Skip part roles the work already has (068 role key: part+substitute+played_on).
    // Never overwrite an existing file — the library is append-only from here.
    const { data: existingParts, error: partsErr } = await service
      .from('repertoire_parts')
      .select('part,substitute,played_on')
      .eq('repertoire_id', workId)
      .eq('organization_id', orgId)
    if (partsErr) return serverError('repertoire: load existing parts', partsErr)

    const taken = new Set(
      (existingParts ?? [])
        .filter((p) => p.substitute === false && (p.played_on == null || p.played_on === ''))
        .map((p) => p.part as string)
    )

    const toInsert = parts.filter((p) => !taken.has(p.part))
    const skipped = parts.filter((p) => taken.has(p.part)).map((p) => p.part)

    if (toInsert.length > 0) {
      const { error: partInsErr } = await service.from('repertoire_parts').insert(
        toInsert.map((p) => ({
          repertoire_id: workId,
          organization_id: orgId,
          part: p.part,
          substitute: false,
          played_on: null,
          storage_path: p.storagePath,
          original_filename: p.originalFilename,
          bytes: p.bytes,
          sha256: p.sha256,
        }))
      )
      if (partInsErr) return serverError('repertoire: insert parts', partInsErr)
    }

    return apiSuccess({
      work: { id: workId, title: existing ? existing.title : title, artist, ensemble },
      existed,
      insertedParts: toInsert.map((p) => p.part),
      skippedParts: skipped,
    })
  } catch (e) {
    if (e instanceof ValidationError) return apiError(e.message, 400)
    return serverError('repertoire: add work', e)
  }
}

class ValidationError extends Error {}
function apiValidation(message: string): ValidationError {
  return new ValidationError(message)
}
