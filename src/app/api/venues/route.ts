import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''

/** Enrich venue data from Google Places API using a place_id */
async function enrichFromPlaceId(placeId: string, name: string) {
  if (!GOOGLE_API_KEY) return null

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=place_id,name,formatted_address,address_components&key=${GOOGLE_API_KEY}`
  const res = await fetch(url)
  const data = await res.json()

  if (data.status !== 'OK' || !data.result) return null

  const comps = data.result.address_components || []
  const get = (type: string, short = false) => {
    const c = comps.find((c: any) => c.types.includes(type))
    return c ? (short ? c.short_name : c.long_name) : ''
  }

  const streetNumber = get('street_number')
  const route = get('route')
  const address = [streetNumber, route].filter(Boolean).join(' ')
  const city = get('locality') || get('sublocality')
  const state = get('administrative_area_level_1', true)
  const zip = get('postal_code')
  const queryParts = [name, address, city, state, zip].filter(Boolean).join(', ')

  return {
    address,
    city,
    state,
    zip,
    google_maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryParts)}&query_place_id=${placeId}`,
  }
}

export async function POST(request: NextRequest) {
  // Verify user is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  let { organization_id, name, address, city, state, zip, google_place_id, google_maps_url } = body

  if (!organization_id || !name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Verify user is admin/owner of this org
  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', organization_id)
    .in('role', ['owner', 'admin'])
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: 'Not authorized for this organization' }, { status: 403 })
  }

  // Use service role client to bypass RLS (we've already verified authorization above)
  const serviceClient = createServiceClient()

  // Check for existing venue with same google_place_id
  if (google_place_id) {
    const { data: existing } = await serviceClient
      .from('venues')
      .select('id')
      .eq('organization_id', organization_id)
      .eq('google_place_id', google_place_id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ id: existing.id, existing: true })
    }
  }

  // If we have a place_id but no address data, enrich from Google Places API
  if (google_place_id && !address) {
    const enriched = await enrichFromPlaceId(google_place_id, name)
    if (enriched) {
      address = enriched.address
      city = enriched.city
      state = enriched.state
      zip = enriched.zip
      google_maps_url = enriched.google_maps_url
    }
  }

  const { data: venue, error } = await serviceClient
    .from('venues')
    .insert({
      organization_id,
      name,
      address: address || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
      google_place_id: google_place_id || null,
      google_maps_url: google_maps_url || null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('Venue creation failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: venue.id })
}
