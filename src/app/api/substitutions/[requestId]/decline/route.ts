import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendSubRequestDeclinedEmail, formatPerformanceDateForSubject } from '@/lib/email/send'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'

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

  // Parse request body for admin notes
  let adminNotes: string | null = null
  try {
    const body = await request.json()
    adminNotes = body.adminNotes || null
  } catch {
    // Body is optional
  }

  // Fetch the substitution request with all related data
  const { data: subRequest, error: fetchError } = await supabase
    .from('substitution_requests')
    .select(`
      *,
      requesting_musician:musicians!requesting_musician_id(id, first_name, last_name, email),
      service:services(id, name),
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
    .eq('id', requestId)
    .single()

  if (fetchError || !subRequest) {
    return NextResponse.json({ error: 'Substitution request not found' }, { status: 404 })
  }

  // Whether this request is still open is decided by the conditional update
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

  const projectServices = (project?.services as any[] || []).sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  const performanceDate = projectServices[0] ? formatPerformanceDateForSubject(projectServices[0].start_time, organization?.timezone || DEFAULT_TIMEZONE) : ''

  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', project.organization_id)
    .eq('user_id', user.id)
    .single()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Unauthorized - admin access required' }, { status: 403 })
  }

  // Claim the request before anything else happens. The status check above was
  // read at fetch time; a second admin (or a double-click) can approve or
  // decline in the gap, and an unguarded update would overwrite that answer and
  // email the musician a decline for a substitution that is already approved.
  // Zero rows means somebody else answered first, so nothing below runs.
  const { data: declinedRequests, error: updateError } = await supabase
    .from('substitution_requests')
    .update({
      status: 'declined',
      admin_notes: adminNotes,
    })
    .eq('id', requestId)
    .eq('status', 'pending_approval')
    .select('id')

  if (updateError) {
    console.error('Failed to update substitution request:', updateError)
    return NextResponse.json({ error: 'Failed to update request' }, { status: 500 })
  }

  if (!declinedRequests || declinedRequests.length === 0) {
    return NextResponse.json(
      { error: 'This request has already been answered' },
      { status: 409 }
    )
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

  // Find the original offer to get the gig URL
  const { data: originalOffer } = await supabase
    .from('contract_offers')
    .select('token')
    .eq('project_position_id', subRequest.project_position_id)
    .eq('musician_id', subRequest.requesting_musician_id)
    .eq('status', 'accepted')
    .single()

  const baseUrl = getAppUrl()
  const gigUrl = originalOffer ? `${baseUrl}/gig/${originalOffer.token}` : baseUrl

  // Send "declined" email to requesting musician
  try {
    if (requestingMusician?.email) {
      await sendSubRequestDeclinedEmail({
        to: requestingMusician.email,
        musicianName: `${requestingMusician.first_name} ${requestingMusician.last_name}`,
        organizationName: organization?.name || 'Orchestra',
        organizationId: organization?.id,
        projectName: project?.name || 'Project',
        instrument: instrument?.name || 'Instrument',
        chairNumber: position?.chair_number || 1,
        totalChairs,
        serviceName,
        suggestedSubName: subRequest.suggested_sub_name,
        adminNotes,
        performanceDate,
        gigUrl,
      }).catch((err) => console.warn('Failed to send declined email:', err))
    }
  } catch (emailError) {
    console.warn('Email sending failed:', emailError)
  }

  return NextResponse.json({
    success: true,
    message: 'Sub request declined. Musician has been notified.',
  })
}
