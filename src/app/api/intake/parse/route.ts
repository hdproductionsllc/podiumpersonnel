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
import { matchSong, capCandidates, type RepertoireRow, type AliasRow, type MatchResult } from '@/lib/intake/matcher'

export interface ProposedSong {
  section: string
  role: string | null
  titleRaw: string
  artistRaw: string
  notes: string | null
  match: MatchResult
}

export async function POST(request: Request) {
  const { membership, error } = await requireOrgAdmin()
  if (error || !membership) return error!

  const orgId = membership.organization_id

  let body: { rawText?: unknown }
  try {
    body = await request.json()
  } catch {
    return apiError('Invalid JSON body', 400)
  }

  const rawText = body?.rawText
  if (typeof rawText !== 'string' || !rawText.trim()) {
    return apiError('Paste the questionnaire text to parse (rawText is required).', 400)
  }

  // 1. Parse (pure; never trusts anything downstream — proposal only).
  const parsed = parseIntake(rawText)

  // 2. Load THIS org's repertoire + aliases (service client, org-scoped).
  const service = createServiceClient()

  const { data: repRows, error: repErr } = await service
    .from('repertoire')
    .select('id,title,artist,ensemble,norm_title')
    .eq('organization_id', orgId)
    .eq('is_active', true)

  if (repErr) return serverError('intake/parse: load repertoire', repErr)

  const { data: aliasRows, error: aliasErr } = await service
    .from('title_aliases')
    .select('alias_norm,repertoire_id')
    .eq('organization_id', orgId)

  if (aliasErr) return serverError('intake/parse: load aliases', aliasErr)

  const index = {
    repertoire: (repRows ?? []) as RepertoireRow[],
    aliases: (aliasRows ?? []) as AliasRow[],
  }

  // 3. Match every parsed song. The parser already returns an ordered, flat
  //    list (section carried on each row) so the review UI can render + reorder.
  const songs: ProposedSong[] = []
  for (const s of parsed.songs) {
    const match = capCandidates(matchSong({ titleRaw: s.titleRaw, artistRaw: s.artistRaw }, index))
    songs.push({
      section: s.section,
      role: s.role,
      titleRaw: s.titleRaw,
      artistRaw: s.artistRaw ?? '',
      notes: null,
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
    },
  })
}
