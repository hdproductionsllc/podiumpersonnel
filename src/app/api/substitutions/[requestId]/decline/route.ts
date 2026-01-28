import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendSubRequestDeclinedEmail } from '@/lib/email/send'
import { getAppUrl } from '@/lib/utils'

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
          organization:organizations(id, name)
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

  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', project.organization_id)
    .eq('user_id', user.id)
    .single()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Unauthorized - admin access required' }, { status: 403 })
  }

  // Update substitution request
  const { error: updateError } = await supabase
    .from('substitution_requests')
    .update({
      status: 'declined',
      admin_notes: adminNotes,
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
        projectName: project?.name || 'Project',
        instrument: instrument?.name || 'Instrument',
        chairNumber: position?.chair_number || 1,
        totalChairs,
        serviceName,
        suggestedSubName: subRequest.suggested_sub_name,
        adminNotes,
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
