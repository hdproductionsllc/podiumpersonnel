/**
 * POST /api/intake/[projectId]/spotify-playlist — create the playlist from
 * ADMIN-CONFIRMED tracks and write its URL onto the intake.
 *
 * Body: { trackUris: string[], name?: string } — the review screen sends the
 * exact confirmed track list, in order. Nothing is searched or guessed here.
 * On success intakes.spotify_url is updated, so the URL flows to the playlist
 * PDFs and the gig page from then on.
 */

import { requireIntakeEnabled, apiError, apiSuccess, serverError } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'
import { createPlaylistWithTracks, getConnection, isSpotifyConfigured } from '@/lib/spotify'

const MAX_TRACKS = 200

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const { membership, error } = await requireIntakeEnabled()
  if (error || !membership) return error!
  const orgId = membership.organization_id

  if (!isSpotifyConfigured()) return apiError('Spotify is not configured on this server.', 503)
  const conn = await getConnection(orgId)
  if (!conn) return apiError('Connect a Spotify account first.', 409)

  let body: { trackUris?: unknown; name?: unknown }
  try {
    body = await request.json()
  } catch {
    return apiError('Invalid JSON body', 400)
  }

  const trackUris = Array.isArray(body.trackUris)
    ? (body.trackUris as unknown[]).filter((u): u is string => typeof u === 'string' && /^spotify:track:[A-Za-z0-9]+$/.test(u))
    : []
  if (trackUris.length === 0 || trackUris.length > MAX_TRACKS) {
    return apiError(`Between 1 and ${MAX_TRACKS} confirmed tracks are required.`, 400)
  }

  const service = createServiceClient()

  const { data: project, error: projErr } = await service
    .from('projects')
    .select('id, organization_id, name, client_name, start_date')
    .eq('id', projectId)
    .maybeSingle()
  if (projErr) return serverError('spotify-playlist: verify project', projErr)
  if (!project || project.organization_id !== orgId) return apiError('Project not found', 404)

  const { data: intake, error: intakeErr } = await service
    .from('intakes')
    .select('id, status')
    .eq('project_id', projectId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (intakeErr) return serverError('spotify-playlist: load intake', intakeErr)
  if (!intake) return apiError('This project has no client selections yet.', 404)
  if (intake.status !== 'confirmed') return apiError('Confirm the client selections first.', 409)

  const dateDisplay = project.start_date
    ? new Date(`${project.start_date}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : ''
  const defaultName = [project.client_name || project.name, dateDisplay].filter(Boolean).join(' — ')
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 100) : defaultName

  try {
    const { url } = await createPlaylistWithTracks(
      conn.accessToken,
      conn.spotify_user_id,
      name,
      'Built with Podium from the confirmed client selections.',
      trackUris
    )

    const { error: updErr } = await service
      .from('intakes')
      .update({ spotify_url: url })
      .eq('id', intake.id)
      .eq('organization_id', orgId)
    if (updErr) {
      // Playlist exists but the save failed — surface the URL anyway.
      console.error('spotify-playlist: url save failed', updErr)
      return apiSuccess({ url, saved: false })
    }
    return apiSuccess({ url, saved: true })
  } catch (e) {
    return serverError('spotify-playlist: create', e)
  }
}
