import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { organization_id, name, address, city, state, zip, google_place_id, google_maps_url } = body

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

  // Check for existing venue with same google_place_id
  if (google_place_id) {
    const { data: existing } = await supabase
      .from('venues')
      .select('id')
      .eq('organization_id', organization_id)
      .eq('google_place_id', google_place_id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ id: existing.id, existing: true })
    }
  }

  const { data: venue, error } = await supabase
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
