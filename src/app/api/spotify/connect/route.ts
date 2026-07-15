/**
 * GET /api/spotify/connect — start the one-time Spotify authorization.
 *
 * Admin-only. Sets a random state in an httpOnly cookie (CSRF protection for
 * the callback) and redirects to Spotify's consent screen with the
 * playlist-modify scopes. The callback route finishes the exchange.
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireOrgAdmin, apiError } from '@/lib/api-helpers'
import { isSpotifyConfigured, spotifyAuthUrl } from '@/lib/spotify'

export async function GET() {
  const { membership, error } = await requireOrgAdmin()
  if (error || !membership) return error!

  if (!isSpotifyConfigured()) {
    return apiError('Spotify is not configured on this server.', 503)
  }

  const state = crypto.randomUUID()
  const jar = await cookies()
  jar.set('spotify_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return NextResponse.redirect(spotifyAuthUrl(state))
}
