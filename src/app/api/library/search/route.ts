/**
 * GET /api/library/search — browse and search the org's music library.
 *
 * Distinct from /api/intake/repertoire, which answers a narrower question
 * ("which work did this unmatched song mean?") and is capped at 20 title-only
 * results. This one backs the library page: it paginates, filters, and returns
 * each work's parts so a human can find a chart and open it.
 *
 * Security: the org is derived from the caller's own membership via
 * requireIntakeEnabled, never from the request. That helper also resolves
 * `libraryOrgId`, which is what makes a shared library work — several brands can
 * point at one shelf, and every read here scopes to the resolved owner rather
 * than the caller's own org id.
 */

import { requireIntakeEnabled, apiSuccess, serverError, apiError } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'
import { normTitle } from '@/lib/intake/normalize'

const PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100

/** Ensembles a work can be arranged for — mirrors the repertoire CHECK constraint. */
const ENSEMBLES = ['quartet', 'quintet', 'trio', 'duo', 'solo', 'viola-trio', 'other']

/** Part roles — mirrors the repertoire_parts CHECK constraint. */
const PARTS = ['vln1', 'vln2', 'vla', 'vc', 'bass', 'voice', 'organ', 'other', 'score']

export interface LibraryPart {
  id: string
  part: string
  substitute: boolean
  played_on: string | null
  original_filename: string
  bytes: number | null
  /** False when the row is indexed but its bytes were never uploaded. */
  available: boolean
}

export interface LibraryWork {
  id: string
  title: string
  artist: string | null
  ensemble: string
  tags: string[]
  parts: LibraryPart[]
}

/** Escape PostgREST ilike wildcards so a query can't break out of the filter. */
function escapeLike(s: string): string {
  return s.replace(/[%_,()\\]/g, ' ').trim()
}

export async function GET(request: Request) {
  const { libraryOrgId, error } = await requireIntakeEnabled()
  if (error || !libraryOrgId) return error ?? apiError('Not found', 404)

  try {
    const url = new URL(request.url)
    const q = (url.searchParams.get('q') ?? '').trim()
    const ensemble = (url.searchParams.get('ensemble') ?? '').trim()
    const part = (url.searchParams.get('part') ?? '').trim()
    const page = Math.max(0, Number(url.searchParams.get('page') ?? '0') || 0)
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(url.searchParams.get('pageSize') ?? PAGE_SIZE) || PAGE_SIZE)
    )

    if (ensemble && !ENSEMBLES.includes(ensemble)) {
      return apiError('Unknown ensemble filter')
    }
    if (part && !PARTS.includes(part)) {
      return apiError('Unknown part filter')
    }

    const service = createServiceClient()

    let query = service
      .from('repertoire')
      .select('id, title, artist, ensemble, tags', { count: 'exact' })
      .eq('organization_id', libraryOrgId)
      .eq('is_active', true)

    if (q) {
      // Match the raw title, the artist, OR the normalized title — the last one
      // folds accents and casing exactly as the indexer did, so "Ave Maria" and
      // "ave maria" and "Avé María" all find the same shelf.
      const raw = escapeLike(q)
      const norm = escapeLike(normTitle(q))
      const clauses = [
        raw && `title.ilike.%${raw}%`,
        raw && `artist.ilike.%${raw}%`,
        norm && `norm_title.ilike.%${norm}%`,
      ].filter(Boolean)
      if (clauses.length > 0) query = query.or(clauses.join(','))
    }

    if (ensemble) query = query.eq('ensemble', ensemble)

    const from = page * pageSize
    const { data: works, count, error: worksError } = await query
      .order('title', { ascending: true })
      .range(from, from + pageSize - 1)

    if (worksError) return serverError('Library search failed', worksError)
    if (!works || works.length === 0) {
      return apiSuccess({ works: [], total: count ?? 0, page, pageSize })
    }

    // Parts in one batched query rather than per-work.
    const { data: parts, error: partsError } = await service
      .from('repertoire_parts')
      .select('id, repertoire_id, part, substitute, played_on, original_filename, bytes, storage_path')
      .eq('organization_id', libraryOrgId)
      .in('repertoire_id', works.map((w) => w.id))

    if (partsError) return serverError('Library search failed', partsError)

    const byWork = new Map<string, LibraryPart[]>()
    for (const p of parts ?? []) {
      const list = byWork.get(p.repertoire_id) ?? []
      list.push({
        id: p.id,
        part: p.part,
        substitute: p.substitute,
        played_on: p.played_on,
        original_filename: p.original_filename,
        bytes: p.bytes,
        // storage_path stays NULL until bytes are uploaded and the sha256
        // re-check passes, so a row can exist with nothing to open yet.
        available: !!p.storage_path,
      })
      byWork.set(p.repertoire_id, list)
    }

    let results: LibraryWork[] = works.map((w) => ({
      id: w.id,
      title: w.title,
      artist: w.artist,
      ensemble: w.ensemble,
      tags: w.tags ?? [],
      parts: (byWork.get(w.id) ?? []).sort((a, b) => a.part.localeCompare(b.part)),
    }))

    // Filtering by part is applied after the join. It narrows the page rather
    // than the query, which is honest about what it does: `total` still counts
    // works matching the text/ensemble filters.
    if (part) {
      results = results
        .map((w) => ({ ...w, parts: w.parts.filter((p) => p.part === part) }))
        .filter((w) => w.parts.length > 0)
    }

    return apiSuccess({
      works: results,
      total: count ?? results.length,
      page,
      pageSize,
      partFiltered: !!part,
    })
  } catch (err) {
    return serverError('Library search failed', err)
  }
}
