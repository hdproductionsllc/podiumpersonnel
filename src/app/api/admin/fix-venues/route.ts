import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''

interface PlaceResult {
  place_id: string
  formatted_address: string
  name: string
  geometry: {
    location: { lat: number; lng: number }
  }
  address_components?: {
    long_name: string
    short_name: string
    types: string[]
  }[]
}

async function findPlace(query: string): Promise<PlaceResult | null> {
  // Use Places API text search to find the place
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,name,formatted_address,geometry,address_components&key=${GOOGLE_API_KEY}`

  const res = await fetch(url)
  const data = await res.json()

  if (data.status === 'OK' && data.candidates?.length > 0) {
    return data.candidates[0]
  }
  return null
}

async function getPlaceDetails(placeId: string): Promise<PlaceResult | null> {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=place_id,name,formatted_address,geometry,address_components&key=${GOOGLE_API_KEY}`

  const res = await fetch(url)
  const data = await res.json()

  if (data.status === 'OK' && data.result) {
    return data.result
  }
  return null
}

function extractAddressComponent(components: PlaceResult['address_components'], type: string, useShort = false): string {
  const comp = (components || []).find(c => c.types.includes(type))
  return comp ? (useShort ? comp.short_name : comp.long_name) : ''
}

export async function POST() {
  const supabase = await createClient()

  // Verify admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get user's org membership
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .in('role', ['owner', 'admin'])
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'Not an admin' }, { status: 403 })
  }

  if (!GOOGLE_API_KEY) {
    return NextResponse.json({ error: 'Google Maps API key not configured' }, { status: 500 })
  }

  // Get all venues for this org that are missing google_place_id
  const { data: venues, error } = await supabase
    .from('venues')
    .select('id, name, address, city, state, zip, google_place_id, google_maps_url')
    .eq('organization_id', membership.organization_id)
    .is('google_place_id', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!venues || venues.length === 0) {
    return NextResponse.json({ message: 'All venues already have Google Place IDs', fixed: 0 })
  }

  let fixed = 0
  let failed = 0
  const results: { name: string; status: string; address?: string }[] = []

  for (const venue of venues) {
    // Rate limit: 100ms between requests
    if (fixed + failed > 0) {
      await new Promise(r => setTimeout(r, 100))
    }

    // Build search query — use whatever info we have
    const searchParts = [venue.name, venue.address, venue.city, venue.state].filter(Boolean)
    const searchQuery = searchParts.join(', ')

    try {
      const place = await findPlace(searchQuery)

      if (!place) {
        results.push({ name: venue.name, status: 'not_found' })
        failed++
        continue
      }

      // Get detailed place info
      const details = await getPlaceDetails(place.place_id)
      const placeData = details || place

      const components = placeData.address_components || []
      const streetNumber = extractAddressComponent(components, 'street_number')
      const route = extractAddressComponent(components, 'route')
      const streetAddress = [streetNumber, route].filter(Boolean).join(' ')
      const city = extractAddressComponent(components, 'locality') || extractAddressComponent(components, 'sublocality')
      const state = extractAddressComponent(components, 'administrative_area_level_1', true)
      const zip = extractAddressComponent(components, 'postal_code')

      const queryParts = [placeData.name || venue.name, streetAddress, city, state, zip].filter(Boolean).join(', ')
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryParts)}&query_place_id=${place.place_id}`

      const { error: updateError } = await supabase
        .from('venues')
        .update({
          google_place_id: place.place_id,
          google_maps_url: mapsUrl,
          // Only update address fields if they're currently empty
          ...(venue.address ? {} : { address: streetAddress || null }),
          ...(venue.city ? {} : { city: city || null }),
          ...(venue.state ? {} : { state: state || null }),
          ...(venue.zip ? {} : { zip: zip || null }),
        })
        .eq('id', venue.id)

      if (updateError) {
        results.push({ name: venue.name, status: 'update_failed' })
        failed++
      } else {
        results.push({
          name: venue.name,
          status: 'fixed',
          address: placeData.formatted_address,
        })
        fixed++
      }
    } catch (err) {
      results.push({ name: venue.name, status: 'error' })
      failed++
    }
  }

  return NextResponse.json({
    message: `Fixed ${fixed} of ${venues.length} venues`,
    fixed,
    failed,
    total: venues.length,
    results,
  })
}
