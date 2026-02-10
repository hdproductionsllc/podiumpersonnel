import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
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

    // Get the most recent send for this project
    const { data: latestSend } = await supabase
      .from('gig_detail_sends')
      .select('id, sent_at, musician_count')
      .eq('project_id', projectId)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!latestSend) {
      return NextResponse.json({ sendId: null, confirmations: [] })
    }

    // Get confirmations for this send
    const { data: confirmations } = await supabase
      .from('gig_detail_confirmations')
      .select(`
        id,
        musician_id,
        confirmed_at,
        musician:musicians(id, first_name, last_name)
      `)
      .eq('send_id', latestSend.id)

    return NextResponse.json({
      sendId: latestSend.id,
      sentAt: latestSend.sent_at,
      musicianCount: latestSend.musician_count,
      confirmations: confirmations || [],
    })
  } catch (error) {
    console.error('Failed to fetch gig details status:', error)
    return NextResponse.json(
      { error: 'Failed to fetch status' },
      { status: 500 }
    )
  }
}
