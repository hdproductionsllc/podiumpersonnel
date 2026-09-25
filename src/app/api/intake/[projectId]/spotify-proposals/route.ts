/**
 * GET /api/intake/[projectId]/spotify-proposals — PROPOSED Spotify track
 * matches for a confirmed intake's songs, for the review screen.
 *
 * Same philosophy as the repertoire matcher: this only searches and ranks —
 * the admin confirms every track before a playlist is created (the
 * spotify-playlist route).
 *
 * A row the admin matched to a library work is searched by THAT work's title
 * and artist, not the client's wording: "Bohemian" is Bohemian Rhapsody by
 * Queen, and "Marry You" is the Bruno Mars song — the match already says so.
 * The client's text is only the search for unmatched rows. Songs are returned in book order with up to five
 * candidates each; a song with no results simply has an empty list.
 */

import { requireIntakeEnabled, apiError, apiSuccess, serverError } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'
import { getConnection, isSpotifyConfigured, searchTracks, type TrackCandidate } from '@/lib/spotify'
import { orderForBook, stripListNumber } from '@/lib/intake/book-builder'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const { membership, libraryOrgId, error } = await requireIntakeEnabled()
  if (error || !membership || !libraryOrgId) return error ?? apiError('Not found', 404)
  const orgId = membership.organization_id

  if (!isSpotifyConfigured()) return apiError('Spotify is not configured on this server.', 503)
  const conn = await getConnection(orgId)
  if (!conn) return apiError('Connect a Spotify account first.', 409)

  const service = createServiceClient()

  const { data: project, error: projErr } = await service
    .from('projects')
    .select('id, organization_id')
    .eq('id', projectId)
    .maybeSingle()
  if (projErr) return serverError('spotify-proposals: verify project', projErr)
  if (!project || project.organization_id !== orgId) return apiError('Project not found', 404)

  const { data: intake, error: intakeErr } = await service
    .from('intakes')
    .select('id, status')
    .eq('project_id', projectId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (intakeErr) return serverError('spotify-proposals: load intake', intakeErr)
  if (!intake) return apiError('This project has no client selections yet.', 404)
  if (intake.status !== 'confirmed') {
    return apiError('Confirm the client selections first.', 409)
  }

  const { data: songRows, error: songsErr } = await service
    .from('intake_songs')
    .select('section, position, title_raw, artist_raw, matched_repertoire_id')
    .eq('intake_id', intake.id)
    .eq('organization_id', orgId)
  if (songsErr) return serverError('spotify-proposals: load songs', songsErr)

  const ordered = orderForBook(songRows ?? [])

  // Matched works live in the (possibly shared) library — scope to it, as the
  // book route does.
  const workIds = [...new Set(ordered.map((r) => r.matched_repertoire_id).filter((v): v is string => !!v))]
  const works = new Map<string, { title: string; artist: string | null }>()
  if (workIds.length > 0) {
    const { data: workRows, error: worksErr } = await service
      .from('repertoire')
      .select('id, title, artist')
      .eq('organization_id', libraryOrgId)
      .in('id', workIds)
    if (worksErr) return serverError('spotify-proposals: load matched works', worksErr)
    for (const w of workRows ?? []) {
      works.set(w.id as string, { title: w.title as string, artist: (w.artist as string | null) ?? null })
    }
  }

  const proposals: Array<{
    num: number
    title: string
    artist: string | null
    candidates: TrackCandidate[]
  }> = []

  // Sequential with tiny batches — 40 searches stay well inside rate limits.
  let num = 0
  for (const row of ordered) {
    num += 1
    const title = stripListNumber(row.title_raw ?? '')
    if (!title.trim()) {
      proposals.push({ num, title: row.title_raw ?? '(untitled)', artist: row.artist_raw ?? null, candidates: [] })
      continue
    }
    const work = row.matched_repertoire_id ? works.get(row.matched_repertoire_id) : undefined
    // A bracketed aside is not part of the recorded title: the library's
    // "Grow Old With You (The Wedding Singer)", the client's "Ordinary (Alex Warren)".
    const searchTitle = (work?.title ?? title).replace(/\s*[([][^)\]]*[)\]]/g, '').trim() || title
    const searchArtist = work?.artist ?? row.artist_raw ?? null
    try {
      const candidates = await searchTracks(conn.accessToken, searchTitle, searchArtist)
      proposals.push({ num, title, artist: row.artist_raw ?? null, candidates })
    } catch {
      // One failed search shouldn't kill the whole proposal set.
      proposals.push({ num, title, artist: row.artist_raw ?? null, candidates: [] })
    }
  }

  return apiSuccess({ proposals, connectedAs: conn.display_name || conn.spotify_user_id })
}
