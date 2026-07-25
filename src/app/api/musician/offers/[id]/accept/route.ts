import { NextResponse } from 'next/server'
import { createClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendOfferAcceptedEmail, sendAdminOfferResponseEmail, formatPerformanceDateForSubject } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'
import { getVenueName, getVenueMapsUrl, getVenueAddress } from '@/lib/venue-helpers'
import { claimChairForAccept, notifyMusicianReleased, countChairs } from '@/lib/offers/respond'

export async function POST(
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

  // Find the offer with all related data
  const { data: offer, error: fetchError } = await supabase
    .from('contract_offers')
    .select(`
      id,
      token,
      status,
      project_position_id,
      musician_id,
      expires_at,
      musician:musicians(id, first_name, last_name, email),
      project_position:project_positions(
        id,
        chair_number,
        musician_id,
        instrument:instruments(id, name),
        project:projects(
          id,
          name,
          organization_id,
          organization:organizations(id, name, timezone),
          services(id, name, service_type, start_time, end_time, venue, venue_id, venue_details:venues!services_venue_id_fkey(name, address, city, state, zip, google_maps_url), venue_2, venue_id_2, venue_2_details:venues!services_venue_id_2_fkey(name, address, city, state, zip, google_maps_url))
        )
      )
    `)
    .eq('id', id)
    .in('musician_id', musicianIds)
    .single()

  if (fetchError || !offer) {
    return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
  }

  // Check if expired
  if (offer.expires_at && new Date(offer.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This offer has expired' }, { status: 400 })
  }

  // Check if can still respond
  if (offer.status !== 'pending' && offer.status !== 'viewed') {
    return NextResponse.json({ error: 'This offer has already been responded to' }, { status: 400 })
  }

  // Type the nested data
  const musician = offer.musician as any
  const position = offer.project_position as any
  const project = position?.project as any
  const organization = project?.organization as any
  const instrument = position?.instrument as any
  const services = project?.services as any[] || []
  const timezone = organization?.timezone || DEFAULT_TIMEZONE
  const sortedServices = [...services].sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  const performanceDate = sortedServices[0] ? formatPerformanceDateForSubject(sortedServices[0].start_time, timezone) : ''

  // Check if this is a substitution offer
  const { data: subRequest } = await supabase
    .from('substitution_requests')
    .select(`
      id,
      requesting_musician_id,
      service_id,
      suggested_sub_name,
      requesting_musician:musicians!requesting_musician_id(id, first_name, last_name, email),
      service:services(id, name)
    `)
    .eq('offer_id', offer.id)
    .eq('status', 'approved')
    .maybeSingle()

  // Accept the offer and claim the chair atomically (shared with the emailed-link
  // path — see claimChairForAccept for why the two conditional updates are what
  // stop two musicians winning the same chair).
  const claim = await claimChairForAccept(supabase, offer as any, subRequest as any)

  if (claim.outcome === 'error') {
    console.error('Failed to accept offer:', claim.error)
    return NextResponse.json({ error: 'Failed to accept offer' }, { status: 500 })
  }

  if (claim.outcome === 'already_responded') {
    return NextResponse.json({ error: 'This offer has already been responded to' }, { status: 409 })
  }

  if (claim.outcome === 'position_filled') {
    return NextResponse.json({ error: 'This position has already been filled' }, { status: 409 })
  }

  // If this is a substitution, update the substitution request and notify original musician
  if (subRequest) {
    await supabase
      .from('substitution_requests')
      .update({ status: 'filled' })
      .eq('id', subRequest.id)

    // Release the original musician's prior accepted offer for this chair so
    // they are no longer counted as confirmed.
    await supabase
      .from('contract_offers')
      .update({ status: 'released' })
      .eq('project_position_id', offer.project_position_id)
      .eq('musician_id', subRequest.requesting_musician_id)
      .eq('status', 'accepted')

    // Shared with the emailed-link path so both send AND record it identically.
    await notifyMusicianReleased(supabase, {
      offer,
      subRequest,
      musician,
      position,
      project,
      organization,
      instrument,
      performanceDate,
    })
  }

  // Send confirmation emails
  try {
    const totalChairs = await countChairs(supabase, project?.id, instrument?.id)

    const formattedServices = services
      .sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
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
        venueAddress: getVenueAddress(service),
        venue2: service.venue_2_details || service.venue_2 ? getVenueName({ venue: service.venue_2, venue_details: service.venue_2_details }) : null,
        venue2Url: service.venue_2_details || service.venue_2 ? getVenueMapsUrl({ venue: service.venue_2, venue_details: service.venue_2_details }) : null,
        venue2Address: service.venue_2_details ? getVenueAddress({ venue_details: service.venue_2_details }) : null,
      }))

    // Get admin emails for both musician confirmation and admin notification
    const adminEmails = project?.organization_id
      ? await getOrgAdminEmails(project.organization_id)
      : []

    if (musician?.email) {
      const baseUrl = getAppUrl()
      const calendarUrl = `${baseUrl}/api/offers/${offer.id}/calendar?token=${(offer as any).token}`
      const googleCalendarUrl = `${baseUrl}/api/offers/${offer.id}/calendar?token=${(offer as any).token}&format=google`

      const acceptedResult = await sendOfferAcceptedEmail({
        to: musician.email,
        musicianName: `${musician.first_name} ${musician.last_name}`,
        organizationName: organization?.name || 'Orchestra',
        organizationId: organization?.id,
        contactEmail: adminEmails[0],
        projectName: project?.name || 'Project',
        instrument: instrument?.name || 'Instrument',
        chairNumber: position?.chair_number || 1,
        totalChairs,
        services: formattedServices,
        calendarUrl,
        googleCalendarUrl,
      }).catch((err) => {
        console.warn('Failed to send musician confirmation:', err)
        return null
      })

      if (acceptedResult && project?.organization_id) {
        await logEmail({
          organizationId: project.organization_id,
          recipientEmail: musician.email,
          recipientName: `${musician.first_name} ${musician.last_name}`,
          subject: acceptedResult.subject,
          emailType: 'offer_accepted',
          musicianId: musician.id,
          projectId: project.id,
          offerId: offer.id,
          resendEmailId: acceptedResult.id || null,
          body: acceptedResult.emailHtml,
        })
      }
    }

    if (project?.organization_id) {

      if (adminEmails.length > 0) {
        const baseUrl = getAppUrl()
        await sendAdminOfferResponseEmail({
          to: adminEmails,
          organizationName: organization?.name || 'Orchestra',
          projectName: project?.name || 'Project',
          musicianName: `${musician?.first_name} ${musician?.last_name}`,
          musicianEmail: musician?.email || null,
          instrument: instrument?.name || 'Instrument',
          chairNumber: position?.chair_number || 1,
          totalChairs,
          status: 'accepted',
          dashboardUrl: `${baseUrl}/dashboard/projects`,
          performanceDate,
        }).catch((err) => console.warn('Failed to send admin notification:', err))
      }
    }
  } catch (emailError) {
    console.warn('Email sending failed:', emailError)
  }

  return NextResponse.json({ success: true, status: 'accepted' })
}
