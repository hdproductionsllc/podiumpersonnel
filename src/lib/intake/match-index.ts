/**
 * Load the repertoire match index for an org's library.
 *
 * Lifted out of /api/intake/parse so the client planner's save endpoint (082)
 * matches through exactly the same index the review screen does — a song typed
 * by the client and the same song pasted from a questionnaire must land on the
 * same work, or the operator sees two different answers for one list.
 *
 * Every read PAGINATES. PostgREST caps a response at 1,000 rows and this library
 * already holds ~3,500 parts; an unpaginated read silently truncates and produces
 * confidently-wrong matches and gap badges.
 *
 * Scope is `libraryOrgId` — the org that OWNS the library, which may be another
 * brand of the same owner (organizations.library_org_id). Never the caller's org
 * id by assumption.
 */

import type { createServiceClient } from '@/lib/supabase/server'
import type {
  RepertoireRow,
  AliasRow,
  MatchIndex,
  PartAvailability,
} from './matcher'

type Service = ReturnType<typeof createServiceClient>

export interface LoadedMatchIndex {
  index: MatchIndex
  /** Part availability per work, for the reviewer's gap badge. Never gates a match. */
  partsByRep: Map<string, PartAvailability>
}

async function selectAll<T>(
  service: Service,
  table: string,
  columns: string,
  libraryOrgId: string
): Promise<{ rows: T[]; error: unknown }> {
  const PAGE = 1000
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    let q = service
      .from(table)
      .select(columns)
      .eq('organization_id', libraryOrgId)
      .range(from, from + PAGE - 1)
    if (table === 'repertoire') q = q.eq('is_active', true)
    const { data, error } = await q
    if (error) return { rows, error }
    const page = (data ?? []) as T[]
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return { rows, error: null }
}

/**
 * Returns the index, or `{ error, context }` for the caller to turn into a 500.
 * Never throws — a matcher that cannot load its index must fail the request
 * loudly, not quietly match nothing (which would read as "we have none of this").
 */
export async function loadMatchIndex(
  service: Service,
  libraryOrgId: string,
  options: { withParts?: boolean } = {}
): Promise<
  | { ok: true; data: LoadedMatchIndex }
  | { ok: false; context: string; error: unknown }
> {
  const rep = await selectAll<RepertoireRow>(
    service,
    'repertoire',
    'id,title,artist,ensemble,norm_title',
    libraryOrgId
  )
  if (rep.error) return { ok: false, context: 'match-index: load repertoire', error: rep.error }

  const alias = await selectAll<AliasRow>(
    service,
    'title_aliases',
    'alias_norm,repertoire_id',
    libraryOrgId
  )
  if (alias.error) return { ok: false, context: 'match-index: load aliases', error: alias.error }

  const partsByRep = new Map<string, PartAvailability>()

  if (options.withParts) {
    const parts = await selectAll<{
      repertoire_id: string
      part: string
      substitute: boolean
      played_on: string | null
    }>(service, 'repertoire_parts', 'repertoire_id,part,substitute,played_on', libraryOrgId)
    if (parts.error) {
      return { ok: false, context: 'match-index: load repertoire parts', error: parts.error }
    }

    for (const p of parts.rows) {
      let pa = partsByRep.get(p.repertoire_id)
      if (!pa) {
        pa = { available: [], substitutes: [] }
        partsByRep.set(p.repertoire_id, pa)
      }
      if (p.substitute) {
        if (p.played_on) pa.substitutes.push({ part: p.part, playedOn: p.played_on })
      } else if (!pa.available.includes(p.part)) {
        pa.available.push(p.part)
      }
    }
  }

  return {
    ok: true,
    data: { index: { repertoire: rep.rows, aliases: alias.rows }, partsByRep },
  }
}
