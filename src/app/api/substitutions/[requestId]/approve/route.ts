import { NextResponse } from 'next/server'
import { createClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendSubRequestApprovedEmail, sendContractOfferEmail, sendAdminOfferSentEmail, formatPerformanceDateForSubject } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'
import { getVenueName, getVenueMapsUrl, getVenueAddress } from '@/lib/venue-helpers'
import { attachVenueDetails } from '@/lib/venue-attach'
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
          services(id, name, service_type, start_time, end_time, venue, venue_id, venue_2, venue_id_2)
        )
      )
    `)
    .eq('id', requestId)
    .single()

  if (fetchError || !subRequest) {
    return NextResponse.json({ error: 'Substitution request not found' }, { status: 404 })
  }

  // Whether this request is still open is decided by the conditional claim
  // below, not by the status read here — a check at fetch time is exactly the
  // one a concurrent approval slips past.

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

  await attachVenueDetails(services)

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

  // Claim the request BEFORE any side effect. The status check above was read at
  // fetch time; a double-click or a second admin used to run the whole body
  // twice, creating two musicians, two offers and two emails for one request.
  // Only one caller can move the row out of pending_approval, and the loser
  // gets zero rows back and stops here.
  const { data: claimedRequests, error: claimError } = await supabase
    .from('substitution_requests')
    .update({ status: 'approved' })
    .eq('id', requestId)
    .eq('status', 'pending_approval')
    .select('id')

  if (claimError) {
    console.error('Failed to claim substitution request:', claimError)
    return NextResponse.json({ error: 'Failed to update request' }, { status: 500 })
  }

  if (!claimedRequests || claimedRequests.length === 0) {
    return NextResponse.json(
      { error: 'This request has already been answered' },
      { status: 409 }
    )
  }

  /**
   * Hand the claim back if the approval cannot be completed, so the request
   * returns to the admin's queue instead of sitting 'approved' with no offer
   * against it. Mirrors the revert in claimChairForAccept().
   */
  const releaseClaim = async (reason: string) => {
    const { error: revertError } = await supabase
      .from('substitution_requests')
      .update({ status: 'pending_approval' })
      .eq('id', requestId)
      .eq('status', 'approved')

    if (revertError) {
      console.error(`Failed to revert substitution request ${requestId} to pending_approval after ${reason}:`, revertError)
    }
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
      await releaseClaim('the substitute musician record could not be created')
      return NextResponse.json({ error: 'Failed to create musician record' }, { status: 500 })
    }

    substituteMusician = newMusician

    // Add instrument association
    if (subRequest.suggested_sub_instrument_id) {
      const { error: instrumentError } = await supabase.from('musician_instruments').insert({
        musician_id: substituteMusician.id,
        instrument_id: subRequest.suggested_sub_instrument_id,
        is_primary: true,
      })

      if (instrumentError) {
        // The musician record exists; they just won't show under the instrument
        // until an admin adds it. Not worth blocking the substitution.
        console.error(`Failed to add instrument ${subRequest.suggested_sub_instrument_id} to new substitute ${substituteMusician.id}:`, instrumentError)
      }
    }
  }

  // Generate a unique token for the contract offer
  const offerToken = randomBytes(32).toString('hex')

  // Set expiration to 7 days from now
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  // Retire any outstanding offer this substitute already holds on this chair
  // before writing a new one — the same "one active offer per chair" step the
  // send-email route runs. Without it, a retried approval (first attempt failed
  // after the insert, or the admin re-approved a request that was reverted)
  // leaves two live offers on one chair, either of which could be accepted.
  const { error: supersedeError } = await supabase
    .from('contract_offers')
    .update({ status: 'expired', responded_at: new Date().toISOString() })
    .eq('project_position_id', subRequest.project_position_id)
    .eq('musician_id', substituteMusician.id)
    .in('status', ['pending', 'viewed'])

  if (supersedeError) {
    console.error('Failed to supersede prior offers for substitute:', supersedeError)
    await releaseClaim(`prior offers for substitute ${substituteMusician.id} could not be superseded`)
    return NextResponse.json({ error: 'Failed to create contract offer' }, { status: 500 })
  }

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
    await releaseClaim(`the contract offer for substitute ${substituteMusician.id} could not be created`)
    return NextResponse.json({ error: 'Failed to create contract offer' }, { status: 500 })
  }

  // Record who the substitute is and which offer went out. The status was
  // already claimed above, so this only fills in the two references.
  const { error: updateError } = await supabase
    .from('substitution_requests')
    .update({
      substitute_musician_id: substituteMusician.id,
      offer_id: contractOffer.id,
    })
    .eq('id', requestId)

  if (updateError) {
    // Without offer_id on the request, the rescind route cannot find this
    // substitution and the original musician would never hear "find another
    // sub". Retire the offer we just made (nothing has been emailed yet),
    // hand the request back to pending_approval, and let the admin retry.
    console.error(`Failed to attach substitute ${substituteMusician.id} and offer ${contractOffer.id} to substitution request ${requestId}:`, updateError)
    const { error: retireError } = await supabase
      .from('contract_offers')
      .update({ status: 'rescinded', responded_at: new Date().toISOString() })
      .eq('id', contractOffer.id)
      .in('status', ['pending', 'viewed'])
    if (retireError) {
      console.error(`Failed to retire offer ${contractOffer.id} after the attach failed:`, retireError)
    }
    await releaseClaim(`the substitute and offer could not be attached to request ${requestId}`)
    return NextResponse.json({ error: 'Failed to record the substitution; please try again' }, { status: 500 })
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
      venueAddress: getVenueAddress(service),
      venue2: service.venue_2_details || service.venue_2 ? getVenueName({ venue: service.venue_2, venue_details: service.venue_2_details }) : null,
      venue2Url: service.venue_2_details || service.venue_2 ? getVenueMapsUrl({ venue: service.venue_2, venue_details: service.venue_2_details }) : null,
      venue2Address: service.venue_2_details ? getVenueAddress({ venue_details: service.venue_2_details }) : null,
    }))

  const baseUrl = getAppUrl()

  // Send emails (non-blocking)
  try {
    // Send "approved" email to requesting musician
    if (requestingMusician?.email) {
      const approvedResult = await sendSubRequestApprovedEmail({
        to: requestingMusician.email,
        musicianName: `${requestingMusician.first_name} ${requestingMusician.last_name}`,
        organizationName: organization?.name || 'Orchestra',
        organizationId: organization?.id,
        projectName: project?.name || 'Project',
        instrument: instrument?.name || 'Instrument',
        chairNumber: position?.chair_number || 1,
        totalChairs,
        serviceName,
        performanceDate,
        suggestedSubName: subRequest.suggested_sub_name,
      }).catch((err) => {
        console.warn('Failed to send approved email:', err)
        return null
      })

      if (approvedResult && project?.organization_id) {
        await logEmail({
          organizationId: project.organization_id,
          recipientEmail: requestingMusician.email,
          recipientName: `${requestingMusician.first_name} ${requestingMusician.last_name}`,
          subject: approvedResult.subject,
          emailType: 'sub_request_approved',
          musicianId: requestingMusician.id,
          projectId: project.id,
          resendEmailId: approvedResult.id || null,
          body: approvedResult.emailHtml,
        })
      }
    }

    // Send contract offer to substitute
    if (subRequest.suggested_sub_email) {
      const subOfferResult = await sendContractOfferEmail({
        to: subRequest.suggested_sub_email,
        musicianName: subRequest.suggested_sub_name,
        organizationName: organization?.name || 'Orchestra',
        organizationId: organization?.id,
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
      }).catch((err) => {
        console.warn('Failed to send offer email:', err)
        return null
      })

      if (subOfferResult && project?.organization_id) {
        await logEmail({
          organizationId: project.organization_id,
          recipientEmail: subRequest.suggested_sub_email,
          recipientName: subRequest.suggested_sub_name,
          subject: subOfferResult.subject,
          emailType: 'contract_offer',
          musicianId: substituteMusician.id,
          projectId: project.id,
          offerId: contractOffer.id,
          resendEmailId: subOfferResult.id || null,
          body: subOfferResult.emailHtml,
        })
      }
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
