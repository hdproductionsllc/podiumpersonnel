import { requireOrgAdmin, apiSuccess, apiError } from '@/lib/api-helpers'
import { acceptedOfferPay, computeGigPay } from '@/lib/payments/compute'

export async function POST(request: Request) {
  const { supabase, membership, error } = await requireOrgAdmin()
  if (error) return error

  try {
    const body = await request.json()
    const { projectId } = body

    // Build query for confirmed positions with their accepted contract offers
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
            start_time,
            base_pay,
            leader_fee
          )
        ),
        musician:musicians(
          id,
          is_leader
        ),
        contract_offers(
          custom_pay,
          status
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

    // One payment per musician per service on service rates; one per musician
    // for the gig when the offer carries a whole-gig amount.
    const paymentsToInsert: {
      organization_id: string
      service_id: string
      musician_id: string
      project_position_id: string
      amount: number
      is_leader_fee: boolean
      status: 'unpaid'
    }[] = []
    // Rows that carry an offer's whole-gig amount: these dedupe per chair, not per service.
    const wholeGigRows = new Set<(typeof paymentsToInsert)[number]>()

    for (const position of positions) {
      const project = position.projects as unknown as {
        id: string
        name: string
        organization_id: string
        services: Array<{
          id: string
          name: string
          start_time: string | null
          base_pay: number | null
          leader_fee: number | null
        }>
      }

      const musician = position.musician as unknown as { id: string; is_leader: boolean } | null
      const offers = position.contract_offers as unknown as Array<{ custom_pay: number | null; status: string }> | null

      if (!musician || !project.services) continue

      // The accepted offer's custom_pay is the actual agreed amount.
      const offerPay = acceptedOfferPay(offers)

      for (const line of computeGigPay(project.services, musician.is_leader, offerPay)) {
        if (line.total <= 0) continue

        const row = {
          organization_id: project.organization_id,
          service_id: line.serviceId,
          musician_id: musician.id,
          project_position_id: position.id,
          amount: line.total,
          is_leader_fee: line.isLeader,
          status: 'unpaid' as const,
        }
        paymentsToInsert.push(row)
        if (line.wholeGig) wholeGigRows.add(row)
      }
    }

    if (paymentsToInsert.length === 0) {
      return apiSuccess({
        created: 0,
        skipped: 0,
        message: 'No payments to generate (services may not have pay amounts set)'
      })
    }

    // Fetch existing payments to avoid duplicates. Service-rate pay is one row
    // per musician per service. A whole-gig amount is one row per chair, so it
    // is skipped if that chair already has ANY payment for this musician: adding
    // or re-timing a service later must not move "first service" and pay twice.
    const orgId = paymentsToInsert[0].organization_id
    const { data: existingPayments, error: existingError } = await supabase
      .from('payments')
      .select('service_id, musician_id, project_position_id')
      .eq('organization_id', orgId)

    if (existingError) {
      // Without this list every row would look new and be paid twice.
      console.error('Error fetching existing payments:', existingError)
      return apiError(existingError.message, 500)
    }

    const existingServiceKeys = new Set(
      (existingPayments || []).map((p) => `${p.service_id}|${p.musician_id}`)
    )
    const existingChairKeys = new Set(
      (existingPayments || []).map((p) => `${p.project_position_id}|${p.musician_id}`)
    )

    const newPayments = paymentsToInsert.filter((p) =>
      wholeGigRows.has(p)
        ? !existingChairKeys.has(`${p.project_position_id}|${p.musician_id}`)
        : !existingServiceKeys.has(`${p.service_id}|${p.musician_id}`)
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
