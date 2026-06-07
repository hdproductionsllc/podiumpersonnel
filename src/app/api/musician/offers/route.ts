import { NextResponse } from 'next/server'
import { createClient, resolveMusicianIds } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'pending' // pending, history
  const impersonateId = searchParams.get('impersonate')

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Resolve musician IDs (supports admin impersonation)
  const { musicianIds, error: resolveError } = await resolveMusicianIds(
    supabase, user.id, impersonateId
  )

  if (resolveError || musicianIds.length === 0) {
    return NextResponse.json({ error: resolveError || 'No musician records found' }, { status: 404 })
  }

  let query = supabase
    .from('contract_offers')
    .select(`
      id,
      token,
      status,
      custom_pay,
      expires_at,
      responded_at,
      created_at,
      musician:musicians(
        id,
        first_name,
        last_name,
        organization:organizations(id, name, timezone, email_logo_url)
      ),
      project_position:project_positions(
        id,
        chair_number,
        instrument:instruments(id, name),
        project:projects(
          id,
          name,
          description,
          start_date,
          end_date
        )
      )
    `)
    .in('musician_id', musicianIds)

  if (status === 'pending') {
    query = query
      .in('status', ['pending', 'viewed'])
      .order('expires_at', { ascending: true, nullsFirst: false })
  } else {
    // History - accepted, declined, rescinded, expired
    query = query
      .in('status', ['accepted', 'declined', 'rescinded', 'expired'])
      .order('responded_at', { ascending: false, nullsFirst: false })
  }

  const { data: offers, error } = await query.limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ offers: offers || [] })
}
