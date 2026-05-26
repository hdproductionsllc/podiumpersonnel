import { NextResponse } from 'next/server'
import { createClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendOfferDeclinedEmail, sendAdminOfferResponseEmail, sendSubDeclinedFindAnotherEmail, formatPerformanceDateForSubject } from '@/lib/email/send'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'

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

  // Update offer to declined
  const { error: offerUpdateError } = await supabase
    .from('contract_offers')
    .update({
      status: 'declined',
      responded_at: new Date().toISOString(),
      response_notes: declineReason,
    })
    .eq('id', offer.id)

  if (offerUpdateError) {
    console.error('Failed to update offer status:', offerUpdateError)
    return NextResponse.json({ error: 'Failed to decline offer' }, { status: 500 })
  }

  // Update position status (back to vacant so another offer can be sent)
  // But only if this is NOT a substitution
  if (!subRequest) {
    const { error: positionUpdateError } = await supabase
      .from('project_positions')
      .update({ status: 'vacant' })
      .eq('id', offer.project_position_id)

    if (positionUpdateError) {
      console.error('Failed to update position:', positionUpdateError)
    }
  }

  // If this is a substitution, update the request and notify original musician
  if (subRequest) {
    await supabase
      .from('substitution_requests')
      .update({ status: 'sub_declined' })
      .eq('id', subRequest.id)

    const originalMusician = subRequest.requesting_musician as any
    const serviceName = (subRequest.service as any)?.name || null

    let totalChairs = 1
    if (project?.id && instrument?.id) {
      const { count } = await supabase
        .from('project_positions')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .eq('instrument_id', instrument.id)
      totalChairs = count || 1
    }

    const { data: originalOffer } = await supabase
      .from('contract_offers')
      .select('token')
      .eq('project_position_id', offer.project_position_id)
      .eq('musician_id', subRequest.requesting_musician_id)
      .eq('status', 'accepted')
      .single()

    const baseUrl = getAppUrl()
    const gigUrl = originalOffer ? `${baseUrl}/gig/${originalOffer.token}` : baseUrl

    if (originalMusician?.email) {
      try {
        await sendSubDeclinedFindAnotherEmail({
          to: originalMusician.email,
          musicianName: `${originalMusician.first_name} ${originalMusician.last_name}`,
          organizationName: organization?.name || 'Orchestra',
          organizationId: organization?.id,
          projectName: project?.name || 'Project',
          instrument: instrument?.name || 'Instrument',
          chairNumber: position?.chair_number || 1,
          totalChairs,
          serviceName,
          suggestedSubName: subRequest.suggested_sub_name || `${musician?.first_name} ${musician?.last_name}`,
          gigUrl,
          performanceDate,
        }).catch((err) => console.warn('Failed to send sub declined email:', err))
      } catch (emailError) {
        console.warn('Email sending failed:', emailError)
      }
    }
  }

  // Send confirmation emails
  try {
    let totalChairs = 1
    if (project?.id && instrument?.id) {
      const { count } = await supabase
        .from('project_positions')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .eq('instrument_id', instrument.id)
      totalChairs = count || 1
    }

    if (musician?.email) {
      await sendOfferDeclinedEmail({
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
      }).catch((err) => console.warn('Failed to send musician confirmation:', err))
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
