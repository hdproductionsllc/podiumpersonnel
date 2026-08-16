/**
 * POST /api/library/works/[workId]/parts — add part PDFs to a work that already
 * exists in the library.
 *
 * The library page looks straight at a work, so it identifies it by id. That is
 * the whole reason this route exists alongside /api/repertoire/add-work: that one
 * identifies the work by (title, artist, ensemble) because it is called from an
 * intake row where the id is not yet known, which means a typo in the title
 * silently creates a SECOND work instead of extending the one on screen. From
 * the library page there is nothing to guess.
 *
 * Rules:
 *  - Org-scoped through the resolved library org, so a work id from another
 *    org's shelf simply does not exist for this caller.
 *  - Append-only. A role the work already fills is REFUSED, naming Replace,
 *    rather than skipped silently (the archived-work bug taught us what a silent
 *    skip feels like from the outside: nothing happened and nothing said so).
 *    It also matches the unique index (repertoire_id, part, substitute,
 *    coalesce(played_on,'')) — the DB would reject it anyway; this explains why.
 *  - Same fidelity gate as add-work: every object is re-downloaded and hashed
 *    server-side before it becomes a row.
 *
 * Bytes reach R2 before this is called, browser → R2 direct through
 * /api/repertoire/upload-url. Nothing large crosses a serverless route.
 */

import { requireIntakeEnabled, apiError, apiSuccess, serverError } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'
import { getR2Client, isR2Configured } from '@/lib/storage/r2'
import { PART_KEYS, PART_OPTIONS } from '@/lib/intake/part-guess'
import { verifyUploadedParts } from '@/lib/repertoire/uploaded-parts'

const MAX_PARTS = 20

const PART_LABELS: Record<string, string> = Object.fromEntries(
  PART_OPTIONS.map((o) => [o.value, o.label])
)

interface IncomingPart {
  part?: unknown
  sha256?: unknown
  bytes?: unknown
  originalFilename?: unknown
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workId: string }> }
) {
  const { workId } = await params
  const { libraryOrgId, error } = await requireIntakeEnabled()
  if (error || !libraryOrgId) return error ?? apiError('Not found', 404)
  const orgId = libraryOrgId

  let body: { parts?: unknown }
  try {
    body = await request.json()
  } catch {
    return apiError('Invalid JSON body')
  }

  const incoming: IncomingPart[] = Array.isArray(body.parts) ? (body.parts as IncomingPart[]) : []
  if (incoming.length === 0 || incoming.length > MAX_PARTS) {
    return apiError(`Between 1 and ${MAX_PARTS} part files are required.`)
  }

  // Shape first — cheapest checks before any storage or database work.
  const parts: Array<{
    part: string
    sha256: string
    bytes: number
    originalFilename: string
    storagePath: string
  }> = []

  for (const [i, p] of incoming.entries()) {
    const part = typeof p.part === 'string' ? p.part : ''
    const sha256 = typeof p.sha256 === 'string' ? p.sha256.toLowerCase() : ''
    const bytes = typeof p.bytes === 'number' ? p.bytes : NaN
    const originalFilename =
      typeof p.originalFilename === 'string' ? p.originalFilename.trim() : ''

    if (!PART_KEYS.has(part)) return apiError(`Part ${i + 1}: unknown part role "${part}".`)
    if (!/^[0-9a-f]{64}$/.test(sha256)) return apiError(`Part ${i + 1}: invalid sha256.`)
    if (!Number.isInteger(bytes) || bytes <= 0) return apiError(`Part ${i + 1}: invalid byte size.`)
    if (!/\.pdf$/i.test(originalFilename)) {
      return apiError('Only PDF files can be added to the library.')
    }

    parts.push({
      part,
      sha256,
      bytes,
      originalFilename,
      // Server-derived, never client-supplied: the client cannot aim this at
      // another org's object, or at a key whose bytes it did not just prove.
      storagePath: `repertoire/${orgId}/${sha256}.pdf`,
    })
  }

  const duplicate = parts.find((p, i) => parts.findIndex((q) => q.part === p.part) !== i)
  if (duplicate) {
    return apiError(
      `Two files are marked as the ${PART_LABELS[duplicate.part] ?? duplicate.part} part. ` +
        'A work holds one file per part.'
    )
  }

  try {
    const service = createServiceClient()

    const { data: work, error: workError } = await service
      .from('repertoire')
      .select('id, title, is_active')
      .eq('id', workId)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (workError) return serverError('library: load work for add-part', workError)
    if (!work) return apiError('Not found', 404)

    const { data: existingParts, error: partsError } = await service
      .from('repertoire_parts')
      .select('id, part, substitute, played_on')
      .eq('repertoire_id', workId)
      .eq('organization_id', orgId)

    if (partsError) return serverError('library: load existing parts', partsError)

    // Only primary parts hold a role's slot; a substitute ("viola covering the
    // cello line") is keyed separately and does not block the real part.
    const taken = new Set(
      (existingParts ?? [])
        .filter((p) => p.substitute === false && (p.played_on == null || p.played_on === ''))
        .map((p) => p.part as string)
    )

    const collision = parts.find((p) => taken.has(p.part))
    if (collision) {
      return apiError(
        `"${work.title}" already has a ${PART_LABELS[collision.part] ?? collision.part} part. ` +
          'Use Replace on that part to swap its file — adding would leave the work with two.',
        409
      )
    }

    if (!isR2Configured()) {
      return apiError('File storage is not configured on this server.', 503)
    }

    // FIDELITY GATE — every object must exist, match its claimed size, and hash
    // back to the sha in its own key. Same implementation add-work uses.
    const problem = await verifyUploadedParts(getR2Client(), parts)
    if (problem) return apiError(problem)

    const { data: inserted, error: insertError } = await service
      .from('repertoire_parts')
      .insert(
        parts.map((p) => ({
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
      .select('id, part, substitute, played_on, original_filename, bytes, storage_path')

    if (insertError) return serverError('library: insert parts', insertError)

    return apiSuccess({
      work: { id: work.id, title: work.title, is_active: work.is_active !== false },
      // Shaped exactly like /api/library/search's parts so the page can splice
      // these into the work it is already showing without a reload.
      parts: (inserted ?? []).map((p) => ({
        id: p.id,
        part: p.part,
        substitute: p.substitute,
        played_on: p.played_on,
        original_filename: p.original_filename,
        bytes: p.bytes,
        available: !!p.storage_path,
      })),
    })
  } catch (err) {
    return serverError('library: add parts', err)
  }
}
