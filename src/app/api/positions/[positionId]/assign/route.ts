import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ positionId: string }> }
) {
  try {
    const { positionId } = await params
    const body = await request.json()
    const { musicianId } = body

    if (!musicianId) {
      return NextResponse.json({ error: 'musicianId is required' }, { status: 400 })
    }

    const supabase = await createClient()

    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch the position with related project data
    const { data: position, error: positionError } = await supabase
      .from('project_positions')
      .select(`
        id,
        chair_number,
        musician_id,
        status,
        instrument_id,
        project_id,
        project:projects(
          id,
          organization_id
        )
      `)
      .eq('id', positionId)
      .single()

    if (positionError || !position) {
      return NextResponse.json({ error: 'Position not found' }, { status: 404 })
    }

    const positionData = position as any
    const project = positionData.project

    // Verify user has permission (is admin/owner of this organization)
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', project?.organization_id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    // Guard against double-assign
    if (positionData.status === 'confirmed' && positionData.musician_id) {
      return NextResponse.json(
        { error: 'Position is already confirmed with a musician assigned' },
        { status: 400 }
      )
    }

    // Verify the musician exists and belongs to the same organization
    const { data: musician, error: musicianError } = await supabase
      .from('musicians')
      .select('id, first_name, last_name, organization_id')
      .eq('id', musicianId)
      .single()

    if (musicianError || !musician) {
      return NextResponse.json({ error: 'Musician not found' }, { status: 404 })
    }

    if (musician.organization_id !== project?.organization_id) {
      return NextResponse.json(
        { error: 'Musician does not belong to this organization' },
        { status: 400 }
      )
    }

    // Check if musician already has an active offer or confirmed assignment in this project
    const { data: projectPositions } = await supabase
      .from('project_positions')
      .select('id, musician_id, status')
      .eq('project_id', positionData.project_id)

    const alreadyAssigned = (projectPositions || []).some(
      (p: any) => p.id !== positionId && p.musician_id === musicianId && p.status === 'confirmed'
    )

    if (alreadyAssigned) {
      return NextResponse.json(
        { error: 'This musician is already confirmed for another position in this project' },
        { status: 400 }
      )
    }

    // Check for active offers for this musician on OTHER positions in this project.
    // An outstanding offer for THIS position is expected and fine — it's exactly the
    // case where a musician was offered the chair and accepted out-of-band (e.g. by
    // text/phone), so we let the admin assign them and resolve that offer below.
    const otherPosIds = (projectPositions || [])
      .map((p: any) => p.id)
      .filter((id: string) => id !== positionId)
    if (otherPosIds.length > 0) {
      const { data: existingOffers } = await supabase
        .from('contract_offers')
        .select('id')
        .eq('musician_id', musicianId)
        .in('project_position_id', otherPosIds)
        .in('status', ['pending', 'viewed'])
        .limit(1)

      if (existingOffers && existingOffers.length > 0) {
        return NextResponse.json(
          { error: 'This musician already has a pending offer for another position in this project' },
          { status: 400 }
        )
      }
    }

    // Assign the musician directly — no contract_offer, no email
    // Only update if no musician is already assigned (prevents race condition)
    const { data: updatedPosition, error: updateError } = await supabase
      .from('project_positions')
      .update({
        musician_id: musicianId,
        status: 'confirmed',
      })
      .eq('id', positionId)
      .is('musician_id', null)
      .select('id')

    if (updateError) {
      console.error('Failed to assign position:', updateError)
      return NextResponse.json({ error: 'Failed to assign position' }, { status: 500 })
    }

    if (!updatedPosition || updatedPosition.length === 0) {
      return NextResponse.json(
        { error: 'This position has already been assigned' },
        { status: 409 }
      )
    }

    // Resolve outstanding offers on this now-filled chair:
    // - the assigned musician's own pending offer → accepted (they said yes off-app)
    // - any other musician's pending offer → expired (the chair is taken)
    // The chair itself is already assigned above, so these are logged rather
    // than failing the request.
    const nowIso = new Date().toISOString()
    const { error: acceptOwnOfferError } = await supabase
      .from('contract_offers')
      .update({ status: 'accepted', responded_at: nowIso })
      .eq('project_position_id', positionId)
      .eq('musician_id', musicianId)
      .in('status', ['pending', 'viewed'])

    if (acceptOwnOfferError) {
      console.error(`Failed to mark musician ${musicianId}'s own offer accepted on position ${positionId}:`, acceptOwnOfferError)
    }

    const { error: expireOthersError } = await supabase
      .from('contract_offers')
      .update({ status: 'expired', responded_at: nowIso })
      .eq('project_position_id', positionId)
      .neq('musician_id', musicianId)
      .in('status', ['pending', 'viewed'])

    if (expireOthersError) {
      console.error(`Failed to expire other musicians' offers on position ${positionId}:`, expireOthersError)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to assign position:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to assign position' },
      { status: 500 }
    )
  }
}
