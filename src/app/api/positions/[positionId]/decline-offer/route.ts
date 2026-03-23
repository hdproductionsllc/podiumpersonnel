import { NextRequest, NextResponse } from 'next/server'
import { createClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendOfferDeclinedEmail, sendAdminOfferResponseEmail, sendSubDeclinedFindAnotherEmail, formatPerformanceDateForSubject } from '@/lib/email/send'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ positionId: string }> }
) {
  try {
    const { positionId } = await params
    const supabase = await createClient()

    // Verify user is authenticated
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

    // Fetch the position with related data
    const { data: position, error: positionError } = await supabase
      .from('project_positions')
      .select(`
        id,
        chair_number,
        musician_id,
        status,
        instrument:instruments(id, name),
        project:projects(
          id,
          name,
          organization_id,
          organization:organizations(id, name, timezone),
          services(start_time)
        )
      `)
      .eq('id', positionId)
      .single()

    if (positionError || !position) {
      return NextResponse.json({ error: 'Position not found' }, { status: 404 })
    }

    const positionData = position as any
    const project = positionData.project
    const organization = project?.organization
    const instrument = positionData.instrument
    const projectServices = (project?.services as any[] || []).sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    const timezone = organization?.timezone || DEFAULT_TIMEZONE
    const performanceDate = projectServices[0] ? formatPerformanceDateForSubject(projectServices[0].start_time, timezone) : ''

    // Verify user has permission (is admin/owner of this organization)
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', project?.organization_id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    // Find the active (pending/viewed) offer for this position
    const { data: offer, error: offerError } = await supabase
      .from('contract_offers')
      .select(`
        id,
        token,
        status,
        project_position_id,
        musician_id,
        musician:musicians(id, first_name, last_name, email)
      `)
      .eq('project_position_id', positionId)
      .in('status', ['pending', 'viewed'])
      .single()

    if (offerError || !offer) {
      return NextResponse.json({ error: 'No active offer found for this position' }, { status: 400 })
    }

    const musician = offer.musician as any

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

    // Reset position to vacant (unless substitution — position stays with original musician)
    if (!subRequest) {
      const { error: positionUpdateError } = await supabase
        .from('project_positions')
        .update({ status: 'vacant' })
        .eq('id', positionId)

      if (positionUpdateError) {
        console.error('Failed to update position:', positionUpdateError)
      }
    }

    // Handle substitution case
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
        .eq('project_position_id', positionId)
        .eq('musician_id', subRequest.requesting_musician_id)
        .eq('status', 'accepted')
        .single()

      const baseUrl = getAppUrl()
      const gigUrl = originalOffer ? `${baseUrl}/gig/${originalOffer.token}` : baseUrl

      if (originalMusician?.email) {
        await sendSubDeclinedFindAnotherEmail({
          to: originalMusician.email,
          musicianName: `${originalMusician.first_name} ${originalMusician.last_name}`,
          organizationName: organization?.name || 'Orchestra',
          projectName: project?.name || 'Project',
          instrument: instrument?.name || 'Instrument',
          chairNumber: positionData.chair_number || 1,
          totalChairs,
          serviceName,
          suggestedSubName: subRequest.suggested_sub_name || `${musician?.first_name} ${musician?.last_name}`,
          gigUrl,
          performanceDate,
        }).catch((err) => console.warn('Failed to send sub declined email:', err))
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

      // Send decline confirmation to musician
      if (musician?.email) {
        await sendOfferDeclinedEmail({
          to: musician.email,
          musicianName: `${musician.first_name} ${musician.last_name}`,
          organizationName: organization?.name || 'Orchestra',
          projectName: project?.name || 'Project',
          instrument: instrument?.name || 'Instrument',
          chairNumber: positionData.chair_number || 1,
          totalChairs,
          declineReason,
          performanceDate,
        }).catch((err) => console.warn('Failed to send musician confirmation:', err))
      }

      // Notify organization admins
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
            chairNumber: positionData.chair_number || 1,
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
  } catch (error) {
    console.error('Failed to decline offer:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to decline offer' },
      { status: 500 }
    )
  }
}
