import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization found' }, { status: 404 })
  }

  if (membership.role !== 'owner' && membership.role !== 'admin') {
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { projectId } = body

    // Build query for confirmed positions
    let positionsQuery = supabase
      .from('project_positions')
      .select(`
        id,
        musician_id,
        project_id,
        projects!inner(
          id,
          name,
          organization_id,
          services(
            id,
            name,
            base_pay,
            leader_fee
          )
        ),
        musician:musicians(
          id,
          is_leader
        )
      `)
      .eq('status', 'confirmed')
      .not('musician_id', 'is', null)

    if (projectId) {
      positionsQuery = positionsQuery.eq('project_id', projectId)
    } else {
      positionsQuery = positionsQuery.eq('projects.organization_id', membership.organization_id)
    }

    const { data: positions, error: positionsError } = await positionsQuery

    if (positionsError) {
      console.error('Error fetching positions:', positionsError)
      return NextResponse.json({ error: positionsError.message }, { status: 500 })
    }

    if (!positions || positions.length === 0) {
      return NextResponse.json({
        created: 0,
        skipped: 0,
        message: 'No confirmed positions found'
      })
    }

    // Generate payment records
    const paymentsToInsert: {
      organization_id: string
      service_id: string
      musician_id: string
      project_position_id: string
      amount: number
      is_leader_fee: boolean
      status: 'unpaid'
    }[] = []

    for (const position of positions) {
      const project = position.projects as unknown as {
        id: string
        name: string
        organization_id: string
        services: Array<{
          id: string
          name: string
          base_pay: number | null
          leader_fee: number | null
        }>
      }

      const musician = position.musician as unknown as { id: string; is_leader: boolean } | null

      if (!musician || !project.services) continue

      for (const service of project.services) {
        // Base pay for all musicians
        if (service.base_pay && service.base_pay > 0) {
          paymentsToInsert.push({
            organization_id: project.organization_id,
            service_id: service.id,
            musician_id: musician.id,
            project_position_id: position.id,
            amount: service.base_pay,
            is_leader_fee: false,
            status: 'unpaid',
          })
        }

        // Leader fee for leaders only
        if (musician.is_leader && service.leader_fee && service.leader_fee > 0) {
          paymentsToInsert.push({
            organization_id: project.organization_id,
            service_id: service.id,
            musician_id: musician.id,
            project_position_id: position.id,
            amount: service.leader_fee,
            is_leader_fee: true,
            status: 'unpaid',
          })
        }
      }
    }

    if (paymentsToInsert.length === 0) {
      return NextResponse.json({
        created: 0,
        skipped: 0,
        message: 'No payments to generate (services may not have pay amounts set)'
      })
    }

    // Insert payments, ignoring duplicates (ON CONFLICT DO NOTHING)
    const { data: inserted, error: insertError } = await supabase
      .from('payments')
      .upsert(paymentsToInsert, {
        onConflict: 'service_id,musician_id,is_leader_fee',
        ignoreDuplicates: true,
      })
      .select()

    if (insertError) {
      console.error('Error inserting payments:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    const createdCount = inserted?.length || 0
    const skippedCount = paymentsToInsert.length - createdCount

    return NextResponse.json({
      created: createdCount,
      skipped: skippedCount,
      message: `Generated ${createdCount} payment records${skippedCount > 0 ? ` (${skippedCount} already existed)` : ''}`,
    })
  } catch (err) {
    console.error('Generate payments error:', err)
    return NextResponse.json({ error: 'Failed to generate payments' }, { status: 500 })
  }
}
