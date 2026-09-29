import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { mostCommonState, pickVenueMatch, type PlaceCandidate } from '@/lib/venue-lookup'

const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''

/** Ask Google for the places a piece of text could mean. Throws when Google refuses. */
async function searchPlaces(query: string): Promise<PlaceCandidate[]> {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&region=us&key=${GOOGLE_API_KEY}`
  const res = await fetch(url)
  const data = await res.json()

  if (data.status === 'ZERO_RESULTS') return []
  if (data.status !== 'OK') throw new Error(`Places text search: ${data.status} ${data.error_message || ''}`.trim())

  return (data.results || [])
    .filter((r: { place_id?: string; name?: string }) => r.place_id && r.name)
    .map((r: { place_id: string; name: string; formatted_address?: string }) => ({
      placeId: r.place_id,
      name: r.name,
      address: r.formatted_address || '',
    }))
}

/**
 * GET /api/venues/lookup?organization_id=...&name=...
 *
 * From a venue name (all a contract gives) to the one place it means. Saves
 * nothing: the venue is created later through POST /api/venues, which fills in
 * the address from the place id. See src/lib/venue-lookup.ts for the rule.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const organizationId = request.nextUrl.searchParams.get('organization_id')
  const name = request.nextUrl.searchParams.get('name')?.trim()
  if (!organizationId || !name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Verify user is admin/owner of this org
  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', organizationId)
    .in('role', ['owner', 'admin'])
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: 'Not authorized for this organization' }, { status: 403 })
  }

  if (!GOOGLE_API_KEY) {
    return NextResponse.json({ match: null, reason: 'unavailable' })
  }

  // Use service role client to bypass RLS (we've already verified authorization above)
  const serviceClient = createServiceClient()
  const { data: savedVenues } = await serviceClient
    .from('venues')
    .select('state')
    .eq('organization_id', organizationId)
  const state = mostCommonState((savedVenues || []).map((v: { state: string | null }) => v.state))

  try {
    // Look where the org works first. A gig further afield is found by the
    // second, unbiased search, which only runs when the first found no match.
    let result = pickVenueMatch(name, await searchPlaces(state ? `${name}, ${state}` : name))
    if (result.reason === 'none' && state) {
      result = pickVenueMatch(name, await searchPlaces(name))
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('Venue lookup failed:', error)
    return NextResponse.json({ match: null, reason: 'unavailable' })
  }
}
