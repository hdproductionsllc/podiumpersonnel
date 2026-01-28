import { NextResponse } from 'next/server'
import { createClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendAdminSubRequestEmail } from '@/lib/email/send'
import { getAppUrl } from '@/lib/utils'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = await createClient()

  // Parse request body
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const {
    serviceId,
    reason,
    subFirstName,
    subLastName,
    subEmail,
    subPhone,
    subInstrumentId,
  } = body

  // Validate required fields
  if (!subFirstName || !subLastName || !subEmail || !subInstrumentId) {
    return NextResponse.json(
      { error: 'Missing required fields: first name, last name, email, and instrument are required' },
      { status: 400 }
    )
  }

  // Find the offer by token with all related data
  const { data: offer, error: fetchError } = await supabase
    .from('contract_offers')
    .select(`
      id,
      status,
      project_position_id,
      musician_id,
      musician:musicians(id, first_name, last_name, email),
      project_position:project_positions(
        id,
        chair_number,
        instrument:instruments(id, name),
        project:projects(
          id,
          name,
          organization_id,
          organization:organizations(id, name, timezone)
        )
      )
    `)
    .eq('token', token)
    .single()

  if (fetchError || !offer) {
    return NextResponse.json({ error: 'Invalid offer token' }, { status: 404 })
  }

  // Check if offer has been accepted (only accepted offers can request subs)
  if (offer.status !== 'accepted') {
    return NextResponse.json(
      { error: 'Only accepted offers can request a substitute' },
      { status: 400 }
    )
  }

  // Type the nested data - eslint-disable needed for Supabase join queries
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const musician = offer.musician as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const position = offer.project_position as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const project = position?.project as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const organization = project?.organization as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instrument = position?.instrument as any

  // Check if there's already a pending sub request
  const { data: existingRequest } = await supabase
    .from('substitution_requests')
    .select('id, status')
    .eq('project_position_id', offer.project_position_id)
    .eq('requesting_musician_id', offer.musician_id)
    .in('status', ['pending_approval', 'approved'])
    .maybeSingle()

  if (existingRequest) {
    return NextResponse.json(
      { error: 'You already have a pending sub request for this position' },
      { status: 400 }
    )
  }

  // Fetch the instrument name for the suggested sub
  const { data: subInstrument } = await supabase
    .from('instruments')
    .select('name')
    .eq('id', subInstrumentId)
    .single()

  // Create the substitution request
  const { data: subRequest, error: createError } = await supabase
    .from('substitution_requests')
    .insert({
      project_position_id: offer.project_position_id,
      requesting_musician_id: offer.musician_id,
      service_id: serviceId || null,
      reason: reason || null,
      status: 'pending_approval',
      suggested_sub_name: `${subFirstName} ${subLastName}`,
      suggested_sub_email: subEmail,
      suggested_sub_phone: subPhone || null,
      suggested_sub_instrument_id: subInstrumentId,
    })
    .select()
    .single()

  if (createError) {
    console.error('Failed to create substitution request:', createError)
    return NextResponse.json(
      { error: 'Failed to create substitution request' },
      { status: 500 }
    )
  }

  // Get service name if a specific service was selected
  let serviceName: string | null = null
  if (serviceId) {
    const { data: service } = await supabase
      .from('services')
      .select('name')
      .eq('id', serviceId)
      .single()
    serviceName = service?.name || null
  }

  // Count total chairs for this instrument
  let totalChairs = 1
  if (project?.id && instrument?.id) {
    const { count } = await supabase
      .from('project_positions')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .eq('instrument_id', instrument.id)
    totalChairs = count || 1
  }

  // Send notification to admins
  try {
    const adminEmails = await getOrgAdminEmails(project.organization_id)

    if (adminEmails.length > 0) {
      const baseUrl = getAppUrl()
      await sendAdminSubRequestEmail({
        to: adminEmails,
        organizationName: organization?.name || 'Orchestra',
        projectName: project?.name || 'Project',
        musicianName: `${musician?.first_name} ${musician?.last_name}`,
        musicianEmail: musician?.email || null,
        instrument: instrument?.name || 'Instrument',
        chairNumber: position?.chair_number || 1,
        totalChairs,
        serviceName,
        reason: reason || null,
        suggestedSubName: `${subFirstName} ${subLastName}`,
        suggestedSubEmail: subEmail,
        suggestedSubPhone: subPhone || null,
        suggestedSubInstrument: subInstrument?.name || 'Instrument',
        dashboardUrl: `${baseUrl}/dashboard/projects/${project.id}`,
      }).catch((err) => console.warn('Failed to send admin notification:', err))
    }
  } catch (emailError) {
    console.warn('Email sending failed:', emailError)
  }

  return NextResponse.json({
    success: true,
    message: 'Your sub request has been submitted and is pending approval',
    requestId: subRequest.id,
  })
}
