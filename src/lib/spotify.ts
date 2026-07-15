/**
 * Spotify Web API client (Book Builder — auto-built playlists).
 *
 * Org-level connection: the owner authorizes once (authorization-code flow,
 * playlist-modify scopes); the refresh token lives in spotify_connections
 * (072, service-role only). Every helper here refreshes the access token as
 * needed and persists the rotation.
 *
 * Matching philosophy mirrors the repertoire matcher: search results are
 * PROPOSALS — the admin reviews every track on a confirm screen before any
 * playlist is created. Nothing here decides.
 */

import { createServiceClient } from '@/lib/supabase/server'
import { getAppUrl } from '@/lib/utils'

const ACCOUNTS = 'https://accounts.spotify.com'
const API = 'https://api.spotify.com/v1'

export const SPOTIFY_SCOPES = 'playlist-modify-public playlist-modify-private'

export function isSpotifyConfigured(): boolean {
  return !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET)
}

export function spotifyRedirectUri(): string {
  return `${getAppUrl()}/api/spotify/callback`
}

export function spotifyAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: spotifyRedirectUri(),
    scope: SPOTIFY_SCOPES,
    state,
    show_dialog: 'false',
  })
  return `${ACCOUNTS}/authorize?${params}`
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64')
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Spotify token request failed: ${data.error_description || data.error || res.status}`)
  }
  return data as TokenResponse
}

export function exchangeCode(code: string): Promise<TokenResponse> {
  return tokenRequest(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: spotifyRedirectUri(),
    })
  )
}

/** The connected Spotify profile (id + display name) for an access token. */
export async function fetchProfile(accessToken: string): Promise<{ id: string; display_name: string | null }> {
  const res = await fetch(`${API}/me`, { headers: { Authorization: `Bearer ${accessToken}` } })
  const data = await res.json()
  if (!res.ok) throw new Error(`Spotify /me failed: ${data.error?.message || res.status}`)
  return { id: data.id as string, display_name: (data.display_name as string | null) ?? null }
}

export interface SpotifyConnection {
  spotify_user_id: string
  display_name: string | null
  accessToken: string
}

/**
 * Load the org's connection and return a VALID access token, refreshing (and
 * persisting the rotation) when expired. Returns null when not connected.
 */
export async function getConnection(orgId: string): Promise<SpotifyConnection | null> {
  const service = createServiceClient()
  const { data: conn, error } = await service
    .from('spotify_connections')
    .select('spotify_user_id, display_name, refresh_token, access_token, token_expires_at')
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error || !conn) return null

  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0
  if (conn.access_token && expiresAt > Date.now() + 60_000) {
    return { spotify_user_id: conn.spotify_user_id, display_name: conn.display_name, accessToken: conn.access_token }
  }

  const refreshed = await tokenRequest(
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refresh_token })
  )
  await service
    .from('spotify_connections')
    .update({
      access_token: refreshed.access_token,
      token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      // Spotify occasionally rotates the refresh token — keep the newest.
      ...(refreshed.refresh_token ? { refresh_token: refreshed.refresh_token } : {}),
    })
    .eq('organization_id', orgId)

  return { spotify_user_id: conn.spotify_user_id, display_name: conn.display_name, accessToken: refreshed.access_token }
}

export interface TrackCandidate {
  uri: string
  name: string
  artists: string
  album: string
  imageUrl: string | null
  durationMs: number
}

/** Search tracks for one song; top results become PROPOSALS for the review UI. */
export async function searchTracks(
  accessToken: string,
  title: string,
  artist: string | null,
  limit = 5
): Promise<TrackCandidate[]> {
  const q = artist ? `${title} artist:${artist}` : title
  const params = new URLSearchParams({ q, type: 'track', limit: String(limit), market: 'US' })
  const res = await fetch(`${API}/search?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Spotify search failed: ${data.error?.message || res.status}`)
  interface RawTrack {
    uri: string
    name: string
    duration_ms: number
    artists: Array<{ name: string }>
    album: { name: string; images: Array<{ url: string }> }
  }
  return ((data.tracks?.items ?? []) as RawTrack[]).map((t) => ({
    uri: t.uri,
    name: t.name,
    artists: t.artists.map((a) => a.name).join(', '),
    album: t.album.name,
    imageUrl: t.album.images.length > 0 ? t.album.images[t.album.images.length - 1].url : null,
    durationMs: t.duration_ms,
  }))
}

/** Create a playlist and add tracks (in order). Returns the public URL. */
export async function createPlaylistWithTracks(
  accessToken: string,
  spotifyUserId: string,
  name: string,
  description: string,
  trackUris: string[]
): Promise<{ url: string; playlistId: string }> {
  const createRes = await fetch(`${API}/users/${encodeURIComponent(spotifyUserId)}/playlists`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, public: true }),
  })
  const playlist = await createRes.json()
  if (!createRes.ok) {
    throw new Error(`Spotify create playlist failed: ${playlist.error?.message || createRes.status}`)
  }

  // Add in batches of 100 (API cap), preserving order.
  for (let i = 0; i < trackUris.length; i += 100) {
    const addRes = await fetch(`${API}/playlists/${playlist.id}/tracks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: trackUris.slice(i, i + 100) }),
    })
    if (!addRes.ok) {
      const err = await addRes.json().catch(() => ({}))
      throw new Error(`Spotify add tracks failed: ${(err as { error?: { message?: string } }).error?.message || addRes.status}`)
    }
  }

  return { url: playlist.external_urls?.spotify ?? `https://open.spotify.com/playlist/${playlist.id}`, playlistId: playlist.id }
}
