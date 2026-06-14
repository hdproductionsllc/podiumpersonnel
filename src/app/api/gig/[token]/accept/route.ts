import { NextResponse } from 'next/server'
import { createServiceClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendOfferAcceptedEmail, sendAdminOfferResponseEmail, sendMusicianReleasedEmail, formatPerformanceDateForSubject } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'
import { getVenueName, getVenueMapsUrl, getVenueAddress } from '@/lib/venue-helpers'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  try {
    return await handleAccept(_request, token)
  } catch (err) {
    // Never surface a raw 500 on the musician's most important flow — send them
    // back to the gig page, which renders status-appropriate messaging.
    console.error(`Error processing accept for gig token ${token}:`, err)
    return NextResponse.redirect(new URL(`/gig/${token}`, _request.url))
  }
}

async function handleAccept(_request: Request, token: string) {
  const supabase = createServiceClient()

  // Find the offer by token with all related data for emails
  const { data: offer, error: fetchError } = await supabase
    .from('contract_offers')
    .select(`
      id,
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
    .eq('token', token)
    .single()

  if (fetchError || !offer) {
    return NextResponse.redirect(new URL(`/gig/${token}`, _request.url))
  }

  // Check if expired
  if (offer.expires_at && new Date(offer.expires_at) < new Date()) {
    return NextResponse.redirect(new URL(`/gig/${token}`, _request.url))
  }

  // Check if can still respond
  if (offer.status !== 'pending' && offer.status !== 'viewed') {
    return NextResponse.redirect(new URL(`/gig/${token}`, _request.url))
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

  // Check if this is a substitution offer by looking for a related substitution request
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

  // Update offer to accepted (optimistic lock: only update if still pending/viewed)
  const { data: updatedOffer } = await supabase
    .from('contract_offers')
    .update({
      status: 'accepted',
      responded_at: new Date().toISOString(),
    })
    .eq('id', offer.id)
    .in('status', ['pending', 'viewed'])
    .select('id')

  if (!updatedOffer || updatedOffer.length === 0) {
    return NextResponse.redirect(new URL(`/gig/${token}`, _request.url))
  }

  // Update position: assign musician and set status to confirmed.
  // Normal offer: the chair must be unassigned (prevents two musicians winning
  // the same chair). Substitution: the chair is held by the requesting (original)
  // musician and is atomically transferred to the substitute.
  let positionUpdate = supabase
    .from('project_positions')
    .update({
      musician_id: offer.musician_id,
      status: 'confirmed',
    })
    .eq('id', offer.project_position_id)
  positionUpdate = subRequest
    ? positionUpdate.eq('musician_id', subRequest.requesting_musician_id)
    : positionUpdate.is('musician_id', null)
  const { data: updatedPosition } = await positionUpdate.select('id')

  if (!updatedPosition || updatedPosition.length === 0) {
    // Chair was no longer available to this musician — revert the offer status
    await supabase
      .from('contract_offers')
      .update({ status: 'pending', responded_at: null })
      .eq('id', offer.id)
    return NextResponse.redirect(new URL(`/gig/${token}`, _request.url))
  }

  // If this is a substitution, update the substitution request and notify original musician
  if (subRequest) {
    // Update substitution request to filled
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

    // Get the original musician's accepted offer token for the gig URL
    const originalMusician = subRequest.requesting_musician as any
    const serviceName = (subRequest.service as any)?.name || null

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

    // Send "you've been released" email to the original musician
    if (originalMusician?.email) {
      try {
        await sendMusicianReleasedEmail({
          to: originalMusician.email,
          musicianName: `${originalMusician.first_name} ${originalMusician.last_name}`,
          organizationName: organization?.name || 'Orchestra',
          organizationId: organization?.id,
          projectName: project?.name || 'Project',
          instrument: instrument?.name || 'Instrument',
          chairNumber: position?.chair_number || 1,
          totalChairs,
          serviceName,
          substituteName: `${musician?.first_name} ${musician?.last_name}`,
          performanceDate,
        }).catch((err) => console.warn('Failed to send musician released email:', err))
      } catch (emailError) {
        console.warn('Email sending failed:', emailError)
      }
    }
  }

  // Send confirmation emails (don't block on failure)
  try {
    // Count total chairs for this instrument in this project
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

    // Send confirmation to musician if they have email
    if (musician?.email) {
      const baseUrl = getAppUrl()
      const calendarUrl = `${baseUrl}/api/offers/${offer.id}/calendar?token=${token}`
      const googleCalendarUrl = `${baseUrl}/api/offers/${offer.id}/calendar?token=${token}&format=google`

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
      }).catch((err) => console.warn('Failed to send musician confirmation:', err))

      if (acceptedResult) {
        await logEmail({
          organizationId: project.organization_id,
          recipientEmail: musician.email,
          recipientName: `${musician.first_name} ${musician.last_name}`,
          subject: acceptedResult?.subject || `Confirmed: You're booked for ${project?.name || 'Project'}`,
          emailType: 'offer_accepted',
          musicianId: musician.id,
          projectId: project.id,
          offerId: offer.id,
          resendEmailId: acceptedResult.id || null,
          body: acceptedResult?.emailHtml,
        })
      }
    }

    // Send notification to organization admins
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
    // Don't block the response on email failure
  }

  return NextResponse.redirect(new URL(`/gig/${token}`, _request.url))
}
