import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const musicianId = searchParams.get('musicianId')

  if (!musicianId) {
    return NextResponse.json({ error: 'Musician ID required' }, { status: 400 })
  }

  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get the musician and verify they have a portal account
  const { data: musician, error: musicianError } = await supabase
    .from('musicians')
    .select(`
      id,
      first_name,
      last_name,
      email,
      user_id,
      organization_id,
      organization:organizations(id, name)
    `)
    .eq('id', musicianId)
    .single()

  if (musicianError || !musician) {
    return NextResponse.json({ error: 'Musician not found' }, { status: 404 })
  }

  if (!musician.user_id) {
    return NextResponse.json({ error: 'Musician does not have a portal account' }, { status: 400 })
  }

  // Verify the current user is an admin of the musician's organization
  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', musician.organization_id)
    .eq('user_id', user.id)
    .single()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Not authorized to view as this musician' }, { status: 403 })
  }

  const organization = musician.organization as unknown as { id: string; name: string }

  return NextResponse.json({
    musician: {
      id: musician.id,
      first_name: musician.first_name,
      last_name: musician.last_name,
      email: musician.email,
    },
    organization: {
      id: organization.id,
      name: organization.name,
    },
  })
}
