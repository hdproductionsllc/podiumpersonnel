/**
 * GET /api/intake/[projectId]/spotify-proposals — PROPOSED Spotify track
 * matches for a confirmed intake's songs, for the review screen.
 *
 * Same philosophy as the repertoire matcher: this only searches and ranks —
 * the admin confirms every track before a playlist is created (the
 * spotify-playlist route). Songs are returned in book order with up to five
 * candidates each; a song with no results simply has an empty list.
 */

import { requireOrgAdmin, apiError, apiSuccess, serverError } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'
import { getConnection, isSpotifyConfigured, searchTracks, type TrackCandidate } from '@/lib/spotify'
import { orderForBook, stripListNumber } from '@/lib/intake/book-builder'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const { membership, error } = await requireOrgAdmin()
  if (error || !membership) return error!
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
    .select('section, position, title_raw, artist_raw')
    .eq('intake_id', intake.id)
    .eq('organization_id', orgId)
  if (songsErr) return serverError('spotify-proposals: load songs', songsErr)

  const ordered = orderForBook(songRows ?? [])

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
    try {
      const candidates = await searchTracks(conn.accessToken, title, row.artist_raw ?? null)
      proposals.push({ num, title, artist: row.artist_raw ?? null, candidates })
    } catch {
      // One failed search shouldn't kill the whole proposal set.
      proposals.push({ num, title, artist: row.artist_raw ?? null, candidates: [] })
    }
  }

  return apiSuccess({ proposals, connectedAs: conn.display_name || conn.spotify_user_id })
}
