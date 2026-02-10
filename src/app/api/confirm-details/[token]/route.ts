import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const supabase = createServiceClient()

    // Find the confirmation by token
    const { data: confirmation, error: fetchError } = await supabase
      .from('gig_detail_confirmations')
      .select('id, confirmed_at')
      .eq('token', token)
      .single()

    if (fetchError || !confirmation) {
      return NextResponse.json({ error: 'Confirmation not found' }, { status: 404 })
    }

    // Already confirmed — just return success
    if (confirmation.confirmed_at) {
      return NextResponse.json({ success: true, alreadyConfirmed: true })
    }

    // Mark as confirmed
    const { error: updateError } = await supabase
      .from('gig_detail_confirmations')
      .update({ confirmed_at: new Date().toISOString() })
      .eq('id', confirmation.id)

    if (updateError) {
      console.error('Failed to confirm:', updateError)
      return NextResponse.json({ error: 'Failed to confirm' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Confirmation error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
