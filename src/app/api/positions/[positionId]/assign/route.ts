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

    // Check for active offers for this musician in this project
    const allPosIds = (projectPositions || []).map((p: any) => p.id)
    const { data: existingOffers } = await supabase
      .from('contract_offers')
      .select('id')
      .eq('musician_id', musicianId)
      .in('project_position_id', allPosIds)
      .in('status', ['pending', 'viewed'])
      .limit(1)

    if (existingOffers && existingOffers.length > 0) {
      return NextResponse.json(
        { error: 'This musician already has a pending offer in this project' },
        { status: 400 }
      )
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

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to assign position:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to assign position' },
      { status: 500 }
    )
  }
}
