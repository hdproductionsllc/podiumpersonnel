import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { confirmGigDetails } from '@/lib/gig-details/confirm'

// The confirm page posts a plain HTML form here, so it works even on phones
// where the page's JavaScript never loads. Every outcome is a 303 back to the
// page, which renders the confirmed state (or the error) from the database.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const page = new URL(`/confirm-details/${token}`, request.url)

  try {
    const supabase = createServiceClient()

    const { data: confirmation, error: lookupError } = await supabase
      .from('gig_detail_confirmations')
      .select('id')
      .eq('token', token)
      .maybeSingle()

    if (lookupError) throw lookupError

    // Unknown token: the page itself shows "not found".
    if (confirmation) {
      await confirmGigDetails(supabase, confirmation.id)
    }
  } catch (error) {
    console.error(`Gig details confirmation failed for token ${token}:`, error)
    page.searchParams.set('error', '1')
  }

  return NextResponse.redirect(page, 303)
}
