import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrgPlan } from '@/lib/api-helpers'
import { canUseEmailFeatures } from '@/lib/plan'
import { sendGigDetailsToMusicians } from '@/lib/send-gig-details'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const supabase = await createClient()

    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify org membership + plan gate
    const { data: mem } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
    if (!mem) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 })
    }
    const plan = await getOrgPlan(mem.organization_id)
    if (plan && !canUseEmailFeatures(plan)) {
      return NextResponse.json({ error: 'Sending gig details requires a Pro subscription' }, { status: 403 })
    }

    // Parse optional notes from body
    let notes: string | undefined
    try {
      const body = await request.json()
      notes = body.notes
    } catch {
      // No body or invalid JSON — that's fine
    }

    const result = await sendGigDetailsToMusicians({
      projectId,
      organizationId: mem.organization_id,
      sentBy: user.id,
      additionalNotes: notes,
    })

    return NextResponse.json({
      success: true,
      sent: result.sent,
      failed: result.failed,
      failedNames: result.failedNames.length > 0 ? result.failedNames : undefined,
      total: result.total,
      sendId: result.sendId,
    })
  } catch (error) {
    console.error('Failed to send gig details:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send gig details' },
      { status: 500 }
    )
  }
}
