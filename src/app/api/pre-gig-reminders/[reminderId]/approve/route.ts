import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendGigDetailsToMusicians } from '@/lib/send-gig-details'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reminderId: string }> }
) {
  try {
    const { reminderId } = await params
    const supabase = await createClient()
    const serviceClient = createServiceClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch reminder
    const { data: reminder, error: reminderError } = await supabase
      .from('pre_gig_reminders')
      .select('*')
      .eq('id', reminderId)
      .single()

    if (reminderError || !reminder) {
      return NextResponse.json({ error: 'Reminder not found' }, { status: 404 })
    }

    if (reminder.status !== 'draft') {
      return NextResponse.json(
        { error: `Reminder has already been ${reminder.status}` },
        { status: 400 }
      )
    }

    // Verify user is admin/owner of this org
    const { data: mem } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', reminder.organization_id)
      .single()

    if (!mem || !['owner', 'admin'].includes(mem.role)) {
      return NextResponse.json({ error: 'Only admins can approve reminders' }, { status: 403 })
    }

    // Parse notes from body
    let notes: string | undefined
    try {
      const body = await request.json()
      notes = body.notes
    } catch {
      // No body — fine
    }

    // Send gig details to musicians using the shared logic
    const result = await sendGigDetailsToMusicians({
      projectId: reminder.project_id,
      organizationId: reminder.organization_id,
      sentBy: user.id,
      additionalNotes: notes,
      serviceClient,
    })

    // Update the reminder as sent
    await serviceClient
      .from('pre_gig_reminders')
      .update({
        status: 'sent',
        notes: notes || null,
        approved_by: user.id,
        sent_at: new Date().toISOString(),
        musician_count: result.sent,
      })
      .eq('id', reminderId)

    return NextResponse.json({
      success: true,
      sent: result.sent,
      failed: result.failed,
      failedNames: result.failedNames.length > 0 ? result.failedNames : undefined,
      total: result.total,
      sendId: result.sendId,
    })
  } catch (error) {
    console.error('Failed to approve reminder:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to approve reminder' },
      { status: 500 }
    )
  }
}
