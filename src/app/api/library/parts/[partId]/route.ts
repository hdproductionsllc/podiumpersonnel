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
    const download = new URL(request.url).searchParams.get('download') === '1'
    const service = createServiceClient()

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
