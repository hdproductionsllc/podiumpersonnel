import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { dropFromGig } from '@/lib/staffing/drop'

/**
 * "I can't make it": a worker who accepted gives the gig back
 * (src/lib/staffing/drop.ts has the rules). Authorized by the offer's token,
 * like accept and decline. A native form POST from the gig page, with an
 * optional `reason`; every outcome sends the worker back to the gig page,
 * which says where things stand.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const back = NextResponse.redirect(new URL(`/gig/${token}`, request.url), 303)

  try {
    const form = await request.formData().catch(() => null)
    const { outcome } = await dropFromGig(createServiceClient(), token, form?.get('reason'))
    if (outcome !== 'released' && outcome !== 'already_released') {
      console.warn(`worker drop for gig token ${token} refused: ${outcome}`)
    }
  } catch (err) {
    // Never a raw 500 on the worker's page: the page shows the offer's real state.
    console.error(`Error processing worker drop for gig token ${token}:`, err)
  }
  return back
}
