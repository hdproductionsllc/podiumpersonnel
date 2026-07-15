/**
 * POST /api/intake/parse — PROPOSE-only questionnaire parse + repertoire match.
 *
 * The admin pastes 17hats questionnaire free text; this route parses it into
 * sections/songs, matches each song against the org's Phase A repertoire, and
 * returns the full proposal for the review screen. It writes NOTHING — the
 * human-confirm gate lives on the review UI (PUT /api/intake/[projectId]).
 *
 * Security: org is derived from the admin's own membership (requireOrgAdmin),
 * never from the request body. The service client read is explicitly scoped to
 * that org id (past cross-tenant leaks came from trusting caller-supplied ids).
 */

import { requireOrgAdmin, apiError, apiSuccess, serverError } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'
import { parseIntake } from '@/lib/intake/parser'
import {
  matchSong,
  capCandidates,
  canonicalEnsemble,
  type RepertoireRow,
  type AliasRow,
  type MatchResult,
  type PartAvailability,
} from '@/lib/intake/matcher'

export interface ProposedSong {
  section: string
  role: string | null
  titleRaw: string
  artistRaw: string
  notes: string | null
  /** The questionnaire marked this line "(*special request*)" — the review UI
   *  prompts the admin to mark the row as a special request. */
  specialRequest: boolean
  match: MatchResult
}

export async function POST(request: Request) {
  const { membership, error } = await requireOrgAdmin()
  if (error || !membership) return error!

  const orgId = membership.organization_id

  let body: { rawText?: unknown; gigEnsemble?: unknown }
  try {
    body = await request.json()
  } catch {
    return apiError('Invalid JSON body', 400)
  }

  const rawText = body?.rawText
  if (typeof rawText !== 'string' || !rawText.trim()) {
    return apiError('Paste the questionnaire text to parse (rawText is required).', 400)
  }

  // Optional ranking hint: the project's ensemble. Folded to the repertoire
  // canon; anything unrecognized is undefined (neutral ranking). Purely a hint —
  // never a gate, never trusted for anything security-sensitive.
  const gigEnsemble = canonicalEnsemble(
    typeof (body as { gigEnsemble?: unknown })?.gigEnsemble === 'string'
      ? (body as { gigEnsemble?: string }).gigEnsemble
      : undefined
  )

  // 1. Parse (pure; never trusts anything downstream — proposal only).
  const parsed = parseIntake(rawText)

  // 2. Load THIS org's repertoire + aliases (service client, org-scoped).
  //    ALL of these reads paginate: PostgREST caps responses at 1,000 rows, and
  //    this org already has 3,558 parts — an unpaginated read silently truncates
  //    and produces confidently-wrong gap badges (adversarial review finding).
  const service = createServiceClient()

  async function selectAll<T>(table: string, columns: string): Promise<{ rows: T[]; error: unknown }> {
    const PAGE = 1000
    const rows: T[] = []
    for (let from = 0; ; from += PAGE) {
      let q = service.from(table).select(columns).eq('organization_id', orgId).range(from, from + PAGE - 1)
      if (table === 'repertoire') q = q.eq('is_active', true)
      const { data, error } = await q
      if (error) return { rows, error }
      const page = (data ?? []) as T[]
      rows.push(...page)
      if (page.length < PAGE) break
    }
    return { rows, error: null }
  }

  const rep = await selectAll<RepertoireRow>('repertoire', 'id,title,artist,ensemble,norm_title')
  if (rep.error) return serverError('intake/parse: load repertoire', rep.error)
  const repRows = rep.rows

  const alias = await selectAll<AliasRow>('title_aliases', 'alias_norm,repertoire_id')
  if (alias.error) return serverError('intake/parse: load aliases', alias.error)
  const aliasRows = alias.rows

  // Part availability per work, so the review UI can show a gap badge
  // ("matched — missing vla"). One extra org-scoped query, aggregated here.
  const parts = await selectAll<{ repertoire_id: string; part: string; substitute: boolean; played_on: string | null }>(
    'repertoire_parts',
    'repertoire_id,part,substitute,played_on'
  )
  if (parts.error) return serverError('intake/parse: load repertoire parts', parts.error)
  const partRows = parts.rows

  const partsByRep = new Map<string, PartAvailability>()
  for (const p of (partRows ?? []) as Array<{ repertoire_id: string; part: string; substitute: boolean; played_on: string | null }>) {
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

  const index = {
    repertoire: (repRows ?? []) as RepertoireRow[],
    aliases: (aliasRows ?? []) as AliasRow[],
  }

  // Decorate a match's candidates with each work's part availability (in place).
  const decorate = (match: MatchResult): MatchResult => {
    for (const c of match.candidates) {
      const pa = partsByRep.get(c.repertoireId)
      if (pa) c.parts = pa
    }
    return match
  }

  // 3. Match every parsed song. The parser already returns an ordered, flat
  //    list (section carried on each row) so the review UI can render + reorder.
  const songs: ProposedSong[] = []
  for (const s of parsed.songs) {
    const match = decorate(
      capCandidates(matchSong({ titleRaw: s.titleRaw, artistRaw: s.artistRaw }, index, gigEnsemble))
    )
    songs.push({
      section: s.section,
      role: s.role,
      titleRaw: s.titleRaw,
      artistRaw: s.artistRaw ?? '',
      notes: null,
      specialRequest: s.specialRequest,
      match,
    })
  }

  return apiSuccess({
    header: {
      contactName: parsed.contactName,
      contactPhone: parsed.contactPhone,
      venueNote: parsed.venueNote,
      spotifyUrl: parsed.spotifyUrl,
      recessionalCue: parsed.recessionalCue,
      processionalOrder: parsed.processionalOrder,
    },
    songs,
    warnings: parsed.warnings,
    stats: {
      total: songs.length,
      matched: songs.filter((s) => s.match.status === 'matched').length,
      ambiguous: songs.filter((s) => s.match.status === 'ambiguous').length,
      missing: songs.filter((s) => s.match.status === 'missing').length,
      special: songs.filter((s) => s.specialRequest).length,
    },
  })
}
