import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { confirmMusicReceipt } from '@/lib/music/confirm-receipt'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const supabase = createServiceClient()

    const { data: confirmation, error: fetchError } = await supabase
      .from('music_confirmations')
      .select('id')
      .eq('token', token)
      .single()

    if (fetchError || !confirmation) {
      return NextResponse.json({ error: 'Confirmation not found' }, { status: 404 })
    }

    // Marks received and emails the admins — unless a download (or an earlier
    // click) already did, in which case nothing is sent twice.
    let marked: boolean
    try {
      marked = await confirmMusicReceipt(supabase, confirmation.id, 'button')
    } catch (updateError) {
      console.error('Failed to confirm music receipt:', updateError)
      return NextResponse.json({ error: 'Failed to confirm' }, { status: 500 })
    }

    return NextResponse.json(marked ? { success: true } : { success: true, alreadyConfirmed: true })
  } catch (error) {
    console.error('Music confirmation error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
