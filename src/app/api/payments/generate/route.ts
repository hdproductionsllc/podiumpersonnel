import { requireOrgAdmin, apiSuccess, apiError } from '@/lib/api-helpers'

export async function POST(request: Request) {
  const { supabase, membership, error } = await requireOrgAdmin()
  if (error) return error

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
      positionsQuery = positionsQuery.eq('projects.organization_id', membership!.organization_id)
    }

    const { data: positions, error: positionsError } = await positionsQuery

    if (positionsError) {
      console.error('Error fetching positions:', positionsError)
      return apiError(positionsError.message, 500)
    }

    if (!positions || positions.length === 0) {
      return apiSuccess({
        created: 0,
        skipped: 0,
        message: 'No confirmed positions found'
      })
    }

    // Generate one payment per musician per service (leader fee included in total)
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
        const basePay = service.base_pay ?? 0
        const leaderFee = (musician.is_leader && service.leader_fee) ? service.leader_fee : 0
        const totalPay = basePay + leaderFee

        if (totalPay <= 0) continue

        paymentsToInsert.push({
          organization_id: project.organization_id,
          service_id: service.id,
          musician_id: musician.id,
          project_position_id: position.id,
          amount: totalPay,
          is_leader_fee: leaderFee > 0,
          status: 'unpaid',
        })
      }
    }

    if (paymentsToInsert.length === 0) {
      return apiSuccess({
        created: 0,
        skipped: 0,
        message: 'No payments to generate (services may not have pay amounts set)'
      })
    }

    // Fetch existing payments to avoid duplicates (one per musician per service)
    const orgId = paymentsToInsert[0].organization_id
    const { data: existingPayments } = await supabase
      .from('payments')
      .select('service_id, musician_id')
      .eq('organization_id', orgId)

    const existingKeys = new Set(
      (existingPayments || []).map(
        (p) => `${p.service_id}|${p.musician_id}`
      )
    )

    const newPayments = paymentsToInsert.filter(
      (p) => !existingKeys.has(`${p.service_id}|${p.musician_id}`)
    )

    if (newPayments.length === 0) {
      return apiSuccess({
        created: 0,
        skipped: paymentsToInsert.length,
        message: 'All payments already exist',
      })
    }

    const { data: inserted, error: insertError } = await supabase
      .from('payments')
      .insert(newPayments)
      .select()

    if (insertError) {
      console.error('Error inserting payments:', insertError)
      return apiError(insertError.message, 500)
    }

    const createdCount = inserted?.length || 0
    const skippedCount = paymentsToInsert.length - createdCount

    return apiSuccess({
      created: createdCount,
      skipped: skippedCount,
      message: `Generated ${createdCount} payment records${skippedCount > 0 ? ` (${skippedCount} already existed)` : ''}`,
    })
  } catch (err) {
    console.error('Generate payments error:', err)
    return apiError('Failed to generate payments', 500)
  }
}
