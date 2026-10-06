/**
 * Load the repertoire match index for an org's library.
 *
 * Lifted out of /api/intake/parse so the (since retired) client planner (082)
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
    const parts = await selectAll<PartRow>(
      service,
      'repertoire_parts',
      'repertoire_id,part,substitute,played_on',
      libraryOrgId
    )
    if (parts.error) {
      return { ok: false, context: 'match-index: load repertoire parts', error: parts.error }
    }
    for (const [id, pa] of aggregateParts(parts.rows)) partsByRep.set(id, pa)
  }

  return {
    ok: true,
    data: { index: { repertoire: rep.rows, aliases: alias.rows }, partsByRep },
  }
}

interface PartRow {
  repertoire_id: string
  part: string
  substitute: boolean
  played_on: string | null
}

/** Fold repertoire_parts rows into per-work part availability. */
export function aggregateParts(rows: PartRow[]): Map<string, PartAvailability> {
  const out = new Map<string, PartAvailability>()
  for (const p of rows) {
    let pa = out.get(p.repertoire_id)
    if (!pa) {
      pa = { available: [], substitutes: [] }
      out.set(p.repertoire_id, pa)
    }
    if (p.substitute) {
      if (p.played_on) pa.substitutes.push({ part: p.part, playedOn: p.played_on })
    } else if (!pa.available.includes(p.part)) {
      pa.available.push(p.part)
    }
  }
  return out
}

/**
 * Part availability for specific works (a project's saved matches, a page of
 * search results). Every work linked to a song must carry its parts, or the
 * review screen shows a clean "Matched" for an arrangement nobody can play
 * from — "Ordinary World" reached book-building with only its Cello II and
 * Double Bass. A work with no part rows maps to an empty availability, which
 * the gap badge reports as every part missing.
 */
export async function loadPartsFor(
  service: Service,
  libraryOrgId: string,
  repertoireIds: string[]
): Promise<{ ok: true; data: Map<string, PartAvailability> } | { ok: false; error: unknown }> {
  const ids = [...new Set(repertoireIds)]
  const out = new Map<string, PartAvailability>(
    ids.map((id) => [id, { available: [], substitutes: [] }])
  )
  // Chunked so a long set list never builds an oversized `in.(...)` URL; each
  // chunk stays far below PostgREST's 1,000-row cap (a work has ~4-12 parts).
  const CHUNK = 50
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await service
      .from('repertoire_parts')
      .select('repertoire_id,part,substitute,played_on')
      .eq('organization_id', libraryOrgId)
      .in('repertoire_id', ids.slice(i, i + CHUNK))
    if (error) return { ok: false, error }
    for (const [id, pa] of aggregateParts((data ?? []) as PartRow[])) out.set(id, pa)
  }
  return { ok: true, data: out }
}
