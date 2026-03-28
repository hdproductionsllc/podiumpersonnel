import { NextResponse } from 'next/server'
import { createClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendSubRequestApprovedEmail, sendContractOfferEmail, sendAdminOfferSentEmail, formatPerformanceDateForSubject } from '@/lib/email/send'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'
import { getVenueName, getVenueMapsUrl } from '@/lib/venue-helpers'
import { randomBytes } from 'crypto'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params
  const supabase = await createClient()

  // Get the current user's session to verify they're an admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch the substitution request with all related data
  const { data: subRequest, error: fetchError } = await supabase
    .from('substitution_requests')
    .select(`
      *,
      requesting_musician:musicians!requesting_musician_id(id, first_name, last_name, email),
      service:services(id, name, start_time),
      project_position:project_positions(
        id,
        chair_number,
        instrument:instruments(id, name),
        project:projects(
          id,
          name,
          organization_id,
          organization:organizations(id, name, timezone, email_logo_url, email_brand_color, email_footer_text),
          services(id, name, service_type, start_time, end_time, venue, venue_id, venue_details:venues!services_venue_id_fkey(name, address, city, state, zip, google_maps_url), venue_2, venue_id_2, venue_2_details:venues!services_venue_id_2_fkey(name, address, city, state, zip, google_maps_url))
        )
      )
    `)
    .eq('id', requestId)
    .single()

  if (fetchError || !subRequest) {
    return NextResponse.json({ error: 'Substitution request not found' }, { status: 404 })
  }

  // Check if request is in pending_approval status
  if (subRequest.status !== 'pending_approval') {
    return NextResponse.json(
      { error: 'This request is not pending approval' },
      { status: 400 }
    )
  }

  // Verify user is an admin of this organization
  // Type the nested data - eslint-disable needed for Supabase join queries
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const position = subRequest.project_position as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const project = position?.project as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const organization = project?.organization as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instrument = position?.instrument as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestingMusician = subRequest.requesting_musician as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const services = project?.services as any[] || []
  const timezone = organization?.timezone || DEFAULT_TIMEZONE

  const projectServices = (project?.services as any[] || []).sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  const performanceDate = projectServices[0] ? formatPerformanceDateForSubject(projectServices[0].start_time, timezone) : ''

  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', project.organization_id)
    .eq('user_id', user.id)
    .single()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Unauthorized - admin access required' }, { status: 403 })
  }

  // Fetch the suggested sub's instrument
  const { data: subInstrument } = await supabase
    .from('instruments')
    .select('id, name')
    .eq('id', subRequest.suggested_sub_instrument_id)
    .single()

  // Parse suggested sub name into first/last
  const nameParts = (subRequest.suggested_sub_name || '').split(' ')
  const subFirstName = nameParts[0] || ''
  const subLastName = nameParts.slice(1).join(' ') || ''

  // Check if musician with this email already exists in the organization
  // Use case-insensitive comparison to prevent duplicate records with different email casing
  let substituteMusician
  const { data: existingMusician } = await supabase
    .from('musicians')
    .select('id, first_name, last_name, email')
    .eq('organization_id', project.organization_id)
    .ilike('email', subRequest.suggested_sub_email || '')
    .maybeSingle()

  if (existingMusician) {
    substituteMusician = existingMusician
  } else {
    // Create new musician record
    const { data: newMusician, error: createMusicianError } = await supabase
      .from('musicians')
      .insert({
        organization_id: project.organization_id,
        first_name: subFirstName,
        last_name: subLastName,
        email: subRequest.suggested_sub_email,
        phone: subRequest.suggested_sub_phone,
        notes: `Added as substitute via sub request from ${requestingMusician.first_name} ${requestingMusician.last_name}`,
      })
      .select()
      .single()

    if (createMusicianError) {
      console.error('Failed to create musician:', createMusicianError)
      return NextResponse.json({ error: 'Failed to create musician record' }, { status: 500 })
    }

    substituteMusician = newMusician

    // Add instrument association
    if (subRequest.suggested_sub_instrument_id) {
      await supabase.from('musician_instruments').insert({
        musician_id: substituteMusician.id,
        instrument_id: subRequest.suggested_sub_instrument_id,
        is_primary: true,
      })
    }
  }

  // Generate a unique token for the contract offer
  const offerToken = randomBytes(32).toString('hex')

  // Set expiration to 7 days from now
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  // Create contract offer for the substitute
  const { data: contractOffer, error: offerError } = await supabase
    .from('contract_offers')
    .insert({
      project_position_id: subRequest.project_position_id,
      musician_id: substituteMusician.id,
      token: offerToken,
      status: 'pending',
      sent_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single()

  if (offerError) {
    console.error('Failed to create contract offer:', offerError)
    return NextResponse.json({ error: 'Failed to create contract offer' }, { status: 500 })
  }

  // Update substitution request
  const { error: updateError } = await supabase
    .from('substitution_requests')
    .update({
      status: 'approved',
      substitute_musician_id: substituteMusician.id,
      offer_id: contractOffer.id,
    })
    .eq('id', requestId)

  if (updateError) {
    console.error('Failed to update substitution request:', updateError)
    return NextResponse.json({ error: 'Failed to update request' }, { status: 500 })
  }

  // Get service name if specific service
  const serviceName = subRequest.service?.name || null

  // Count total chairs
  let totalChairs = 1
  if (project?.id && instrument?.id) {
    const { count } = await supabase
      .from('project_positions')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .eq('instrument_id', instrument.id)
    totalChairs = count || 1
  }

  // Format services for email
  const formattedServices = services
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((service: any) => ({
      name: service.name,
      date: new Date(service.start_time).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: timezone,
      }),
      time: new Date(service.start_time).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: timezone,
      }),
      venue: getVenueName(service),
      venueUrl: getVenueMapsUrl(service),
      venue2: service.venue_2_details || service.venue_2 ? getVenueName({ venue: service.venue_2, venue_details: service.venue_2_details }) : null,
      venue2Url: service.venue_2_details || service.venue_2 ? getVenueMapsUrl({ venue: service.venue_2, venue_details: service.venue_2_details }) : null,
    }))

  const baseUrl = getAppUrl()

  // Send emails (non-blocking)
  try {
    // Send "approved" email to requesting musician
    if (requestingMusician?.email) {
      await sendSubRequestApprovedEmail({
        to: requestingMusician.email,
        musicianName: `${requestingMusician.first_name} ${requestingMusician.last_name}`,
        organizationName: organization?.name || 'Orchestra',
        projectName: project?.name || 'Project',
        instrument: instrument?.name || 'Instrument',
        chairNumber: position?.chair_number || 1,
        totalChairs,
        serviceName,
        performanceDate,
        suggestedSubName: subRequest.suggested_sub_name,
      }).catch((err) => console.warn('Failed to send approved email:', err))
    }

    // Send contract offer to substitute
    if (subRequest.suggested_sub_email) {
      await sendContractOfferEmail({
        to: subRequest.suggested_sub_email,
        musicianName: subRequest.suggested_sub_name,
        organizationName: organization?.name || 'Orchestra',
        projectName: project?.name || 'Project',
        instrument: subInstrument?.name || instrument?.name || 'Instrument',
        chairNumber: position?.chair_number || 1,
        totalChairs,
        services: formattedServices,
        responseUrl: `${baseUrl}/gig/${offerToken}`,
        expiresAt: expiresAt.toISOString(),
        notes: `You have been requested as a substitute by ${requestingMusician.first_name} ${requestingMusician.last_name}.`,
        branding: {
          logoUrl: organization?.email_logo_url,
          brandColor: organization?.email_brand_color,
          footerText: organization?.email_footer_text,
        },
      }).catch((err) => console.warn('Failed to send offer email:', err))
    }

    // Send notification to admins
    const adminEmails = await getOrgAdminEmails(project.organization_id)
    if (adminEmails.length > 0) {
      await sendAdminOfferSentEmail({
        to: adminEmails,
        organizationName: organization?.name || 'Orchestra',
        projectName: project?.name || 'Project',
        musicianName: subRequest.suggested_sub_name,
        musicianEmail: subRequest.suggested_sub_email,
        instrument: subInstrument?.name || instrument?.name || 'Instrument',
        chairNumber: position?.chair_number || 1,
        totalChairs,
        services: formattedServices,
        dashboardUrl: `${baseUrl}/dashboard/projects/${project.id}`,
      }).catch((err) => console.warn('Failed to send admin notification:', err))
    }
  } catch (emailError) {
    console.warn('Email sending failed:', emailError)
  }

  return NextResponse.json({
    success: true,
    message: 'Sub request approved. Offer sent to substitute.',
    offerId: contractOffer.id,
    substituteId: substituteMusician.id,
  })
}
