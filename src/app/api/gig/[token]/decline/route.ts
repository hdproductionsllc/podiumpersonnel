import { NextResponse } from 'next/server'
import { createServiceClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendOfferDeclinedEmail, sendAdminOfferResponseEmail, formatPerformanceDateForSubject } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'
import { markOfferDeclined, notifySubDeclined, countChairs, isOfferClosed } from '@/lib/staffing/respond'
import { isLiveOffer } from '@/lib/staffing/live'
import { releaseSeat } from '@/lib/staffing/seats'
import { logEvent, musicianActor, type StaffingEvent } from '@/lib/staffing/events'
import { advance, autoOfferNote } from '@/lib/staffing/cascade'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  try {
    return await handleDecline(_request, token)
  } catch (err) {
    // Never surface a raw 500 on the musician's most important flow — send them
    // back to the gig page, which renders status-appropriate messaging.
    console.error(`Error processing decline for gig token ${token}:`, err)
    return NextResponse.redirect(new URL(`/gig/${token}`, _request.url))
  }
}

async function handleDecline(_request: Request, token: string) {
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
      response_notes,
      musician:musicians(id, first_name, last_name, email, is_active),
      project_position:project_positions(
        id,
        chair_number,
        instrument:instruments(id, name),
        project:projects(
          id,
          name,
          status,
          organization_id,
          organization:organizations(id, name, timezone),
          services(start_time)
        )
      )
    `)
    .eq('token', token)
    .single()

  if (fetchError || !offer) {
    return NextResponse.redirect(new URL(`/gig/${token}`, _request.url))
  }

  // Past its deadline, or already answered/withdrawn: nothing to decline.
  if (!isLiveOffer(offer)) {
    return NextResponse.redirect(new URL(`/gig/${token}`, _request.url))
  }

  // Type the nested data
  const musician = offer.musician as any
  const position = offer.project_position as any
  const project = position?.project as any
  const organization = project?.organization as any
  const instrument = position?.instrument as any

  // A cancelled or completed gig, or a deactivated musician, closes the offer
  // even though its own status still says pending. The gig page shows it closed.
  if (isOfferClosed(project, musician)) {
    return NextResponse.redirect(new URL(`/gig/${token}`, _request.url))
  }

  const services = (project?.services as any[] || []).sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  const timezone = organization?.timezone || DEFAULT_TIMEZONE
  const performanceDate = services[0] ? formatPerformanceDateForSubject(services[0].start_time, timezone) : ''

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

  // Decline under the same optimistic lock as the accept path, so a stale
  // decline can't clobber an acceptance that landed first.
  const declineOutcome = await markOfferDeclined(supabase, offer)

  if (declineOutcome !== 'declined') {
    // Already responded to (e.g. accepted concurrently), or the update failed —
    // either way don't reset the chair or send a decline email.
    return NextResponse.redirect(new URL(`/gig/${token}`, _request.url))
  }

  // Free the chair so another offer can go out. Substitutions keep the chair
  // with the original musician, so skip it there. The decline is already
  // recorded, so a failure here must not turn the musician's answer into an
  // error — but it leaves a declined musician's chair marked offered, so it is
  // logged loudly. releaseSeat only frees a chair nobody holds: if someone is in
  // it they got it another way, and a decline must not evict them.
  let seatReleased = false
  if (!subRequest) {
    const seat = await releaseSeat(supabase, offer.project_position_id, 'declined')
    if (seat.error) {
      console.error(`Failed to vacate chair ${offer.project_position_id} after decline:`, seat.error)
    }
    seatReleased = seat.released
  }

  const actor = musicianActor(offer.musician_id)
  const events: StaffingEvent[] = [{
    organizationId: project?.organization_id,
    actor,
    entityType: 'offer',
    entityId: offer.id,
    action: 'offer.declined',
    before: { status: offer.status },
    after: {
      status: 'declined',
      position_id: offer.project_position_id,
      seat_released: seatReleased,
      ...(subRequest ? { substitution_request_id: subRequest.id } : {}),
    },
  }]

  // If this is a substitution, update the substitution request and notify original musician.
  // The decline itself is already committed above, so a failure here is logged
  // for the contractor rather than reported to the musician as a failed decline.
  if (subRequest) {
    // Update substitution request to sub_declined
    const { error: subDeclineError } = await supabase
      .from('substitution_requests')
      .update({ status: 'sub_declined' })
      .eq('id', subRequest.id)

    if (subDeclineError) {
      console.error(`Failed to mark substitution request ${subRequest.id} sub_declined after decline of offer ${offer.id}:`, subDeclineError)
    } else {
      events.push({
        organizationId: project?.organization_id,
        actor,
        entityType: 'substitution_request',
        entityId: subRequest.id,
        action: 'substitution.ended',
        before: { status: 'approved' },
        after: { status: 'sub_declined', reason: 'declined', offer_id: offer.id },
      })
    }

    // Tell the original musician their sub fell through. Shared with the portal
    // path, which also records it — this route used to send without logging, so
    // the notice never reached the contractor's email log.
    await notifySubDeclined(supabase, {
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

  await logEvent(events)

  // Auto-offer: with the organization's switch on, offer the chair to the next
  // person now (cascade.ts). Never for a substitute's offer: the chair is still
  // the original musician's. advance() never throws, and the decline above is
  // already committed whatever it does.
  const cascade = subRequest
    ? null
    : await advance(supabase, { positionId: offer.project_position_id, triggerOfferId: offer.id, trigger: 'declined' })
  const autoOffer = autoOfferNote(cascade, timezone)

  // Send confirmation emails (don't block on failure)
  try {
    const totalChairs = await countChairs(supabase, project?.id, instrument?.id)

    // Send confirmation to musician if they have email
    if (musician?.email) {
      const declinedResult = await sendOfferDeclinedEmail({
        to: musician.email,
        musicianName: `${musician.first_name} ${musician.last_name}`,
        organizationName: organization?.name || 'Orchestra',
        organizationId: organization?.id,
        projectName: project?.name || 'Project',
        instrument: instrument?.name || 'Instrument',
        chairNumber: position?.chair_number || 1,
        totalChairs,
        declineReason: offer.response_notes,
        performanceDate,
      }).catch((err) => console.warn('Failed to send musician confirmation:', err))

      if (declinedResult) {
        await logEmail({
          organizationId: project.organization_id,
          recipientEmail: musician.email,
          recipientName: `${musician.first_name} ${musician.last_name}`,
          subject: declinedResult?.subject || `Thank you for your response - ${project?.name || 'Project'}`,
          emailType: 'offer_declined',
          musicianId: musician.id,
          projectId: project.id,
          offerId: offer.id,
          resendEmailId: declinedResult.id || null,
          body: declinedResult?.emailHtml,
        })
      }
    }

    // Send notification to organization admins
    if (project?.organization_id) {
      const adminEmails = await getOrgAdminEmails(project.organization_id)

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
          status: 'declined',
          responseNotes: offer.response_notes,
          dashboardUrl: `${baseUrl}/dashboard/projects`,
          performanceDate,
          ...(autoOffer ? { autoOffer } : {}),
        }).catch((err) => console.warn('Failed to send admin notification:', err))
      }
    }
  } catch (emailError) {
    console.warn('Email sending failed:', emailError)
    // Don't block the response on email failure
  }

  return NextResponse.redirect(new URL(`/gig/${token}`, _request.url))
}
