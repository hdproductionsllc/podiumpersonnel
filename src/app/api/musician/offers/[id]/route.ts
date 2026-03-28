import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get all musician records for this user
  const { data: musicians } = await supabase
    .from('musicians')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)

  if (!musicians || musicians.length === 0) {
    return NextResponse.json({ error: 'No musician records found' }, { status: 404 })
  }

  const musicianIds = musicians.map((m) => m.id)

  // Fetch the offer
  const { data: offer, error } = await supabase
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
        email,
        organization:organizations(id, name, timezone, email_logo_url, email_brand_color, musician_policy)
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
          end_date,
          organization_id
        )
      )
    `)
    .eq('id', id)
    .in('musician_id', musicianIds)
    .single()

  if (error || !offer) {
    return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
  }

  // Get services for this project
  const position = offer.project_position as any
  const project = position?.project

  let services: any[] = []
  if (project?.id) {
    const { data: serviceData } = await supabase
      .from('services')
      .select(`
        id,
        name,
        service_type,
        start_time,
        end_time,
        venue,
        base_pay,
        leader_fee,
        venue_info:venues!services_venue_id_fkey(id, name, address, city, state, google_maps_url)
      `)
      .eq('project_id', project.id)
      .order('start_time', { ascending: true })

    services = serviceData || []
  }

  // Calculate total pay
  let totalPay: number | null = offer.custom_pay
  if (totalPay === null && services.length > 0) {
    const isLeader = position?.chair_number === 1
    totalPay = services.reduce((sum: number, service: any) => {
      const basePay = service.base_pay || 0
      const leaderFee = isLeader ? (service.leader_fee || 0) : 0
      return sum + basePay + leaderFee
    }, 0)
  }

  // Count total chairs for this instrument
  let totalChairs = 1
  if (project?.id && position?.instrument?.id) {
    const { count } = await supabase
      .from('project_positions')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .eq('instrument_id', position.instrument.id)

    totalChairs = count || 1
  }

  // Mark as viewed if pending
  if (offer.status === 'pending') {
    await supabase
      .from('contract_offers')
      .update({
        status: 'viewed',
        viewed_at: new Date().toISOString(),
      })
      .eq('id', offer.id)
  }

  return NextResponse.json({
    offer,
    services,
    totalPay,
    totalChairs,
  })
}
