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

import { requireIntakeEnabled, apiError, apiSuccess, serverError } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'
import { parseIntake } from '@/lib/intake/parser'
import {
  matchSong,
  capCandidates,
  canonicalEnsemble,
  type MatchResult,
} from '@/lib/intake/matcher'
import { loadMatchIndex } from '@/lib/intake/match-index'

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
  const { membership, libraryOrgId, error } = await requireIntakeEnabled()
  if (error || !membership || !libraryOrgId) return error ?? apiError('Not found', 404)

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

  // 2. Load the caller's (possibly SHARED) library repertoire + aliases + parts,
  //    scoped to libraryOrgId — the org that owns the library, which may be a
  //    different brand of the same owner. Paginated inside loadMatchIndex; the
  //    client planner's save endpoint (082) matches through the same helper so
  //    both paths see one index.
  const service = createServiceClient()

  const loaded = await loadMatchIndex(service, libraryOrgId, { withParts: true })
  if (!loaded.ok) return serverError(loaded.context, loaded.error)
  const { index, partsByRep } = loaded.data

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
