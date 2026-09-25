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
  const { error: persistError } = await service
    .from('spotify_connections')
    .update({
      access_token: refreshed.access_token,
      token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      // Spotify occasionally rotates the refresh token — keep the newest.
      ...(refreshed.refresh_token ? { refresh_token: refreshed.refresh_token } : {}),
    })
    .eq('organization_id', orgId)

  if (persistError) {
    // The fresh token still works for this request; the next call just has to
    // refresh again. If Spotify rotated the refresh token, losing it here is
    // what eventually forces a reconnect — worth a loud log.
    console.error(`Failed to persist refreshed Spotify token for org ${orgId}:`, persistError)
  }

  return { spotify_user_id: conn.spotify_user_id, display_name: conn.display_name, accessToken: refreshed.access_token }
}

export type { TrackCandidate } from '@/lib/spotify-ranking'
import { rankTracks, titleAgrees, type RawTrack, type TrackCandidate as Candidate } from '@/lib/spotify-ranking'

/**
 * Search tracks for one song; top results become PROPOSALS for the review UI.
 *
 * Runs up to three searches and pools them: title + artist field-filtered, then
 * title-only field-filtered, then loose. Pooling (not fall-back-on-empty) is
 * what makes a WRONG artist harmless: the library credits "What a Wonderful
 * World" to its songwriters (Weiss/Thiele), whose name finds nothing, and the
 * title-only search still reaches Louis Armstrong. Ranking then puts title
 * agreement first and original-ness second (see spotify-ranking.ts).
 */
export async function searchTracks(
  accessToken: string,
  title: string,
  artist: string | null,
  limit = 5
): Promise<Candidate[]> {
  // Spotify search answers the SAME query with a 502 one moment and results the
  // next (observed 2026-09-25, roughly one call in three). Without a retry a
  // song silently loses its match to a coin flip. 429s say how long to wait.
  const run = async (q: string): Promise<RawTrack[]> => {
    const params = new URLSearchParams({ q, type: 'track', limit: '10', market: 'US' })
    for (let attempt = 0; ; attempt += 1) {
      const res = await fetch(`${API}/search?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) return (data.tracks?.items ?? []) as RawTrack[]
      const retryable = res.status === 429 || res.status >= 500
      if (!retryable || attempt >= 3) {
        throw new Error(`Spotify search failed: ${data.error?.message || res.status}`)
      }
      const retryAfter = Number(res.headers.get('retry-after'))
      const waitMs = retryAfter > 0 ? Math.min(retryAfter, 5) * 1000 : 400 * 2 ** attempt
      await new Promise((r) => setTimeout(r, waitMs))
    }
  }

  // Quotes inside a field filter end it early — drop them from the query only.
  const q = (s: string) => s.replace(/["“”]/g, '')
  const pool: RawTrack[] = []
  // One failed search must not throw away what the others found; only a song
  // where EVERY attempted search failed is reported as a failure.
  let lastError: unknown = null
  let succeeded = 0
  const add = async (query: string) => {
    try {
      pool.push(...(await run(query)))
      succeeded += 1
    } catch (e) {
      lastError = e
    }
  }
  const agreeing = () => pool.filter((t) => titleAgrees(t.name, title)).length
  if (artist) await add(`track:"${q(title)}" artist:"${q(artist)}"`)
  if (agreeing() < limit) await add(`track:"${q(title)}"`)
  if (agreeing() === 0) await add(artist ? `${title} ${artist}` : title)
  if (succeeded === 0 && lastError) throw lastError

  return rankTracks(pool, artist, limit, title)
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
