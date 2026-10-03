import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { confirmMusicReceipt } from '@/lib/music/confirm-receipt'

// The confirm page posts a plain HTML form here, so it works even on phones
// where the page's JavaScript never loads. Every outcome is a 303 back to the
// page, which renders the confirmed state (or the error) from the database.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const page = new URL(`/confirm-music/${token}`, request.url)

  try {
    const supabase = createServiceClient()

    const { data: confirmation, error: lookupError } = await supabase
      .from('music_confirmations')
      .select('id')
      .eq('token', token)
      .maybeSingle()

    if (lookupError) throw lookupError

    // Marks received and emails the admins — unless a download (or an earlier
    // click) already did, in which case nothing is sent twice. Unknown token:
    // the page itself shows "not found".
    if (confirmation) {
      await confirmMusicReceipt(supabase, confirmation.id, 'button')
    }
  } catch (error) {
    console.error(`Music confirmation failed for token ${token}:`, error)
    page.searchParams.set('error', '1')
  }

  return NextResponse.redirect(page, 303)
}
