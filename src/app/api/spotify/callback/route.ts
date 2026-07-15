/**
 * GET /api/spotify/callback — finish the Spotify authorization.
 *
 * Verifies the CSRF state cookie, exchanges the code for tokens, resolves the
 * connected profile, and upserts the org's spotify_connections row (072,
 * service-role only). Redirects back to the dashboard with a status flag the
 * UI can toast on.
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireOrgAdmin } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'
import { exchangeCode, fetchProfile } from '@/lib/spotify'
import { getAppUrl } from '@/lib/utils'

function back(flag: string): NextResponse {
  return NextResponse.redirect(`${getAppUrl()}/dashboard/projects?spotify=${flag}`)
}

export async function GET(request: Request) {
  const { membership, error } = await requireOrgAdmin()
  if (error || !membership) return error!
  const orgId = membership.organization_id

  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const denied = url.searchParams.get('error')

  const jar = await cookies()
  const expectedState = jar.get('spotify_oauth_state')?.value
  jar.delete('spotify_oauth_state')

  if (denied) return back('denied')
  if (!code || !state || !expectedState || state !== expectedState) {
    return back('state_mismatch')
  }

  try {
    const tokens = await exchangeCode(code)
    if (!tokens.refresh_token) return back('error')
    const profile = await fetchProfile(tokens.access_token)

    const service = createServiceClient()
    const { error: upsertErr } = await service.from('spotify_connections').upsert(
      {
        organization_id: orgId,
        spotify_user_id: profile.id,
        display_name: profile.display_name,
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      },
      { onConflict: 'organization_id' }
    )
    if (upsertErr) {
      console.error('spotify callback: upsert failed', upsertErr)
      return back('error')
    }
    return back('connected')
  } catch (e) {
    console.error('spotify callback failed', e)
    return back('error')
  }
}
