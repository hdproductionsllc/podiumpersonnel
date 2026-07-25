import { NextResponse } from 'next/server'
import { createServiceClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendOfferDeclinedEmail, sendAdminOfferResponseEmail, formatPerformanceDateForSubject } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'
import { markOfferDeclined, vacateChair, notifySubDeclined, countChairs } from '@/lib/offers/respond'

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
      musician:musicians(id, first_name, last_name, email),
      project_position:project_positions(
        id,
        chair_number,
        instrument:instruments(id, name),
        project:projects(
          id,
          name,
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
  // with the original musician, so skip it there.
  if (!subRequest) {
    await vacateChair(supabase, offer.project_position_id)
  }

  // If this is a substitution, update the substitution request and notify original musician
  if (subRequest) {
    // Update substitution request to sub_declined
    await supabase
      .from('substitution_requests')
      .update({ status: 'sub_declined' })
      .eq('id', subRequest.id)

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
        }).catch((err) => console.warn('Failed to send admin notification:', err))
      }
    }
  } catch (emailError) {
    console.warn('Email sending failed:', emailError)
    // Don't block the response on email failure
  }

  return NextResponse.redirect(new URL(`/gig/${token}`, _request.url))
}
