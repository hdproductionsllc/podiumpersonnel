/**
 * GET /api/intake/repertoire?q=... — lightweight repertoire search for the
 * intake review screen's "Not in library" search box.
 *
 * When the parser can't match a song, the admin needs to hand-pick the right
 * work from the org's library. This returns the top matches for a free-text
 * query so the reviewer can resolve a missing/ambiguous row by hand.
 *
 * PROPOSE-only, like the rest of intake: it reads the repertoire and returns
 * candidates; the human on the review screen decides. Nothing is written here.
 *
 * Security: org is derived from the admin's own membership (requireOrgAdmin),
 * never from the request. The service-client read is explicitly scoped to that
 * org id (past cross-tenant leaks came from trusting caller-supplied ids). The
 * query is matched against the SAME normalized title the Phase A indexer stored
 * (normTitle), so a search folds identically to how the library was indexed.
 */

import { requireIntakeEnabled, apiError, apiSuccess, serverError } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'
import { normTitle } from '@/lib/intake/normalize'

const MAX_RESULTS = 20

export interface RepertoireSearchResult {
  id: string
  title: string
  artist: string | null
  ensemble: string
}

/** Escape PostgREST ilike wildcards/commas so a query can't break the filter. */
function escapeLike(s: string): string {
  return s.replace(/[%_,()\\]/g, ' ').trim()
}

export async function GET(request: Request) {
  const { membership, error } = await requireIntakeEnabled()
  if (error || !membership) return error!

  const orgId = membership.organization_id

  const url = new URL(request.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  if (!q) return apiSuccess({ results: [] })

  const rawLike = escapeLike(q)
  const normLike = escapeLike(normTitle(q))
  if (!rawLike && !normLike) return apiSuccess({ results: [] })

  const service = createServiceClient()

  // Match on the display title OR the normalized title (the field the indexer
  // keyed on), so both "Canon in D" and a messier "canon d" surface the work.
  const orFilters = [
    rawLike && `title.ilike.%${rawLike}%`,
    normLike && `norm_title.ilike.%${normLike}%`,
  ].filter(Boolean).join(',')

  const { data, error: repErr } = await service
    .from('repertoire')
    .select('id,title,artist,ensemble')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .or(orFilters)
    .order('title', { ascending: true })
    .limit(MAX_RESULTS)

  if (repErr) return serverError('intake/repertoire: search', repErr)

  return apiSuccess({ results: (data ?? []) as RepertoireSearchResult[] })
}
