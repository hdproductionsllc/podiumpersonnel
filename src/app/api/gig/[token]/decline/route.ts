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
    .select('id, status, project_position_id, expires_at')
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

  // Update offer to declined
  await supabase
    .from('contract_offers')
    .update({
      status: 'declined',
      responded_at: new Date().toISOString(),
    })
    .eq('id', offer.id)

  // Update position status to declined
  await supabase
    .from('project_positions')
    .update({ status: 'declined' })
    .eq('id', offer.project_position_id)

  return NextResponse.redirect(new URL(`/gig/${token}`, _request.url))
}
