import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = await createClient()

  // Find the offer by token
  const { data: offer, error: fetchError } = await supabase
    .from('contract_offers')
    .select('id, status, project_position_id, musician_id, expires_at')
    .eq('token', token)
    .single()

  if (fetchError || !offer) {
    return NextResponse.redirect(new URL(`/gig/${token}`, _request.url))
  }

  // Check if expired
  if (offer.expires_at && new Date(offer.expires_at) < new Date()) {
    return NextResponse.redirect(new URL(`/gig/${token}`, _request.url))
  }

  // Check if can still respond
  if (offer.status !== 'pending' && offer.status !== 'viewed') {
    return NextResponse.redirect(new URL(`/gig/${token}`, _request.url))
  }

  // Update offer to accepted
  await supabase
    .from('contract_offers')
    .update({
      status: 'accepted',
      responded_at: new Date().toISOString(),
    })
    .eq('id', offer.id)

  // Update position: assign musician and set status to confirmed
  await supabase
    .from('project_positions')
    .update({
      musician_id: offer.musician_id,
      status: 'confirmed',
    })
    .eq('id', offer.project_position_id)

  return NextResponse.redirect(new URL(`/gig/${token}`, _request.url))
}
