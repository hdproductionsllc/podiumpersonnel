import { NextResponse } from 'next/server'
import { createClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendOfferDeclinedEmail, sendAdminOfferResponseEmail, formatPerformanceDateForSubject } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'
import { markOfferDeclined, vacateChair, notifySubDeclined, countChairs } from '@/lib/offers/respond'

export async function POST(
  request: Request,
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

  // Get decline reason from body if provided
  let declineReason: string | null = null
  try {
    const body = await request.json()
    declineReason = body.reason || null
  } catch {
    // No body provided, that's fine
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
  const projectServices = (project?.services as any[] || []).sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  const timezone = organization?.timezone || DEFAULT_TIMEZONE
  const performanceDate = projectServices[0] ? formatPerformanceDateForSubject(projectServices[0].start_time, timezone) : ''

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

  // Decline under the same optimistic lock as the accept path, so a stale
  // decline can't clobber an acceptance that landed first.
  const declineOutcome = await markOfferDeclined(supabase, offer, declineReason)

  if (declineOutcome === 'error') {
    return NextResponse.json({ error: 'Failed to decline offer' }, { status: 500 })
  }

  if (declineOutcome === 'already_responded') {
    return NextResponse.json({ error: 'This offer has already been responded to' }, { status: 409 })
  }

  // Free the chair so another offer can go out. Substitutions keep the chair
  // with the original musician, so skip it there.
  if (!subRequest) {
    await vacateChair(supabase, offer.project_position_id)
  }

  // If this is a substitution, update the request and notify original musician
  if (subRequest) {
    await supabase
      .from('substitution_requests')
      .update({ status: 'sub_declined' })
      .eq('id', subRequest.id)

    // Shared with the emailed-link path so both send AND record it identically.
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

  // Send confirmation emails
  try {
    const totalChairs = await countChairs(supabase, project?.id, instrument?.id)

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
        declineReason,
        performanceDate,
      }).catch((err) => {
        console.warn('Failed to send musician confirmation:', err)
        return null
      })

      if (declinedResult && project?.organization_id) {
        await logEmail({
          organizationId: project.organization_id,
          recipientEmail: musician.email,
          recipientName: `${musician.first_name} ${musician.last_name}`,
          subject: declinedResult.subject,
          emailType: 'offer_declined',
          musicianId: musician.id,
          projectId: project.id,
          offerId: offer.id,
          resendEmailId: declinedResult.id || null,
          body: declinedResult.emailHtml,
        })
      }
    }

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
          responseNotes: declineReason,
          dashboardUrl: `${baseUrl}/dashboard/projects`,
          performanceDate,
        }).catch((err) => console.warn('Failed to send admin notification:', err))
      }
    }
  } catch (emailError) {
    console.warn('Email sending failed:', emailError)
  }

  return NextResponse.json({ success: true, status: 'declined' })
}
