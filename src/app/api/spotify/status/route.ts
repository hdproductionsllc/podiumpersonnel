/**
 * GET /api/spotify/status — is this org connected to Spotify, and as whom?
 * Admin-only; returns no tokens, ever.
 */

import { requireOrgAdmin, apiSuccess } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'
import { isSpotifyConfigured } from '@/lib/spotify'

export async function GET() {
  const { membership, error } = await requireOrgAdmin()
  if (error || !membership) return error!

  if (!isSpotifyConfigured()) {
    return apiSuccess({ configured: false, connected: false, displayName: null })
  }

  const service = createServiceClient()
  const { data: conn } = await service
    .from('spotify_connections')
    .select('display_name, spotify_user_id')
    .eq('organization_id', membership.organization_id)
    .maybeSingle()

  return apiSuccess({
    configured: true,
    connected: !!conn,
    displayName: conn?.display_name || conn?.spotify_user_id || null,
  })
}
