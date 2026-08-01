import { NextResponse } from 'next/server'
import { requireIntakeEnabled, apiError, serverError } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'
import { getR2Client, isR2Configured } from '@/lib/storage/r2'

/**
 * GET /api/library/parts/[partId]?download=1 — open or download one part PDF.
 *
 * This is the only route that hands out a readable link to the sheet music, so
 * the protections live here rather than in the page:
 *
 *  - The bucket is private. Nothing in R2 is reachable without a signature; this
 *    route mints one per click rather than exposing a durable URL anywhere.
 *  - Links expire in LINK_TTL_SECONDS. Long enough to open a chart, short enough
 *    that a forwarded link is dead by the time it travels. A leaked URL is a
 *    minutes-long window, not a permanent key to the catalogue.
 *  - The caller must be an admin of an org with intake enabled, and the part must
 *    belong to that org's resolved library. A part id from another org 404s.
 *  - Responses are no-store and X-Robots-Tag: noindex, so nothing about this
 *    surface lands in a cache or a crawler's index.
 *  - The redirect carries Referrer-Policy: no-referrer, so the signed R2 URL is
 *    never leaked onward in a Referer header.
 *
 * The signature itself is computed locally from the R2 key — no call to
 * Cloudflare — so minting a link costs nothing. Only the browser's actual fetch
 * is a billable read, and R2 egress is free.
 */

/** Short on purpose: enough to open a PDF, not enough to circulate. */
const LINK_TTL_SECONDS = 300

/** Headers that keep this surface out of caches, crawlers, and Referer chains. */
const PRIVATE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
  'Referrer-Policy': 'no-referrer',
} as const

export async function GET(
  request: Request,
  { params }: { params: Promise<{ partId: string }> }
) {
  const { partId } = await params
  const { libraryOrgId, error } = await requireIntakeEnabled()
  if (error || !libraryOrgId) return error ?? apiError('Not found', 404)

  try {
    const url = new URL(request.url)
    const download = url.searchParams.get('download') === '1'
    // Look at a superseded arrangement without restoring it first — otherwise
    // you would be putting back a file you cannot see.
    const versionId = url.searchParams.get('versionId')
    const service = createServiceClient()

    if (versionId) {
      const { data: version } = await service
        .from('repertoire_part_versions')
        .select('storage_path, original_filename')
        .eq('id', versionId)
        .eq('part_id', partId)
        .eq('organization_id', libraryOrgId)
        .maybeSingle()

      if (!version?.storage_path) {
        return NextResponse.json({ error: 'Not found' }, { status: 404, headers: PRIVATE_HEADERS })
      }
      if (!isR2Configured()) {
        return NextResponse.json(
          { error: 'File storage is not configured.' },
          { status: 503, headers: PRIVATE_HEADERS }
        )
      }

      const versionUrl = await getR2Client().getSignedUrl(version.storage_path, LINK_TTL_SECONDS, {
        download,
        filename: version.original_filename || 'previous.pdf',
        contentType: 'application/pdf',
      })
      return NextResponse.redirect(versionUrl, { status: 302, headers: PRIVATE_HEADERS })
    }

    // Scoped to the resolved library org, so a part id belonging to anyone else
    // simply does not exist as far as this caller is concerned.
    const { data: part, error: lookupError } = await service
      .from('repertoire_parts')
      .select('id, storage_path, original_filename, repertoire:repertoire(title, artist)')
      .eq('id', partId)
      .eq('organization_id', libraryOrgId)
      .maybeSingle()

    if (lookupError) return serverError('Library part lookup failed', lookupError)
    if (!part) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: PRIVATE_HEADERS })
    }

    if (!part.storage_path) {
      // Indexed but never uploaded — a real state in this library, not an error.
      return NextResponse.json(
        { error: 'This part is catalogued but its file has not been uploaded yet.' },
        { status: 409, headers: PRIVATE_HEADERS }
      )
    }

    if (!isR2Configured()) {
      return NextResponse.json(
        { error: 'File storage is not configured.' },
        { status: 503, headers: PRIVATE_HEADERS }
      )
    }

    const work = part.repertoire as unknown as { title: string; artist: string | null } | null
    const signedUrl = await getR2Client().getSignedUrl(part.storage_path, LINK_TTL_SECONDS, {
      download,
      filename: downloadName(part.original_filename, work),
      contentType: 'application/pdf',
    })

    return NextResponse.redirect(signedUrl, { status: 302, headers: PRIVATE_HEADERS })
  } catch (err) {
    return serverError('Library part access failed', err)
  }
}

/**
 * What the file should be called once saved. Prefers the original on-disk name,
 * which the importer preserved exactly; falls back to the work's title so a
 * download never lands as a bare UUID.
 */
function downloadName(
  originalFilename: string | null,
  work: { title: string; artist: string | null } | null
): string {
  if (originalFilename && originalFilename.trim()) return originalFilename.trim()
  const base = [work?.title, work?.artist].filter(Boolean).join(' - ') || 'part'
  return `${base}.pdf`
}

/**
 * DELETE /api/library/parts/[partId] — remove one part from a work.
 *
 * Deletes the row only. The R2 object is deliberately left alone: keys are
 * content-addressed (repertoire/<org>/<sha256>.pdf), so two parts holding
 * identical bytes share one object. Deleting it because one part went away would
 * break every other part pointing at the same bytes — including parts on other
 * works. Storage is fractions of a cent per GB; a wrongly deleted chart is not.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ partId: string }> }
) {
  const { partId } = await params
  const { libraryOrgId, error } = await requireIntakeEnabled()
  if (error || !libraryOrgId) return error ?? apiError('Not found', 404)

  try {
    const service = createServiceClient()

    const { data: deleted, error: deleteError } = await service
      .from('repertoire_parts')
      .delete()
      .eq('id', partId)
      .eq('organization_id', libraryOrgId)
      .select('id, part')

    if (deleteError) return serverError('Library part delete failed', deleteError)
    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: PRIVATE_HEADERS })
    }

    return NextResponse.json({ success: true, part: deleted[0] }, { headers: PRIVATE_HEADERS })
  } catch (err) {
    return serverError('Library part delete failed', err)
  }
}

/**
 * PUT /api/library/parts/[partId] — point a part at a different PDF.
 *
 * The browser hashes the replacement, uploads it straight to R2 through
 * /api/repertoire/upload-url (bytes never cross a serverless route), then calls
 * this to repoint the row. Because keys are content-addressed, the caller does
 * not choose where the bytes live — the key is derived from the hash, so a
 * client cannot aim this at another org's object.
 *
 * The previous object is left in place for the same reason DELETE leaves it:
 * another part may share those exact bytes.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ partId: string }> }
) {
  const { partId } = await params
  const { user, libraryOrgId, error } = await requireIntakeEnabled()
  if (error || !libraryOrgId) return error ?? apiError('Not found', 404)
  const userId = user?.id ?? null

  let body: { sha256?: unknown; bytes?: unknown; filename?: unknown }
  try {
    body = await request.json()
  } catch {
    return apiError('Invalid JSON body')
  }

  const sha256 = typeof body.sha256 === 'string' ? body.sha256.toLowerCase() : ''
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    return apiError('sha256 must be 64 lowercase hex characters.')
  }
  const bytes = typeof body.bytes === 'number' ? body.bytes : NaN
  if (!Number.isInteger(bytes) || bytes <= 0) {
    return apiError('bytes must be a positive integer.')
  }
  const filename = typeof body.filename === 'string' ? body.filename.trim() : ''
  if (!/\.pdf$/i.test(filename)) {
    return apiError('Only PDF files can be added to the library.')
  }

  // Derived server-side from the hash, matching the importer and upload-url.
  const storagePath = `repertoire/${libraryOrgId}/${sha256}.pdf`

  try {
    if (!isR2Configured()) {
      return apiError('File storage is not configured.', 503)
    }

    // Confirm the bytes really landed before repointing the row. Otherwise a
    // failed upload would leave the part advertising a file that is not there.
    const head = await getR2Client().headObject(storagePath)
    if (!head) {
      return apiError('That file has not finished uploading yet. Try again.', 409)
    }
    if (head.size !== bytes) {
      return apiError('The uploaded file does not match the size reported. Try again.', 409)
    }

    const service = createServiceClient()

    // Read the outgoing file first so it can be archived. Without this the
    // previous arrangement becomes unreachable the moment the row is repointed —
    // the bytes survive in R2, but nothing records what they were.
    const { data: current } = await service
      .from('repertoire_parts')
      .select('id, repertoire_id, storage_path, sha256, bytes, original_filename')
      .eq('id', partId)
      .eq('organization_id', libraryOrgId)
      .maybeSingle()

    if (!current) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: PRIVATE_HEADERS })
    }

    if (current.storage_path === storagePath) {
      // Same content-addressed key means identical bytes: nothing to archive and
      // nothing to change. Say so rather than writing a no-op version row.
      return NextResponse.json(
        { error: 'That is the same file this part already uses.' },
        { status: 409, headers: PRIVATE_HEADERS }
      )
    }

    const { data: updated, error: updateError } = await service
      .from('repertoire_parts')
      .update({
        storage_path: storagePath,
        sha256,
        bytes,
        original_filename: filename,
        updated_at: new Date().toISOString(),
      })
      .eq('id', partId)
      .eq('organization_id', libraryOrgId)
      .select('id, part, original_filename, bytes')

    if (updateError) return serverError('Library part replace failed', updateError)
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: PRIVATE_HEADERS })
    }

    // Only once the row is safely repointed. Archiving first would leave a
    // history entry for a replacement that never happened.
    if (current.original_filename) {
      const { error: versionError } = await service.from('repertoire_part_versions').insert({
        part_id: current.id,
        repertoire_id: current.repertoire_id,
        organization_id: libraryOrgId,
        storage_path: current.storage_path,
        sha256: current.sha256,
        bytes: current.bytes,
        original_filename: current.original_filename,
        replaced_by: userId,
      })
      // Best-effort: the replacement itself succeeded, and failing the request
      // now would tell the user it didn't. Logged loudly instead.
      if (versionError) {
        console.error(`Failed to archive previous version of part ${partId}:`, versionError)
      }
    }

    return NextResponse.json({ success: true, part: updated[0] }, { headers: PRIVATE_HEADERS })
  } catch (err) {
    return serverError('Library part replace failed', err)
  }
}
