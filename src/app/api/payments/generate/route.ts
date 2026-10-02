import { requireOrgAdmin, apiSuccess, apiError } from '@/lib/api-helpers'
import { acceptedOfferIncludesLeaderFee, acceptedOfferPay, computeGigPay, type OfferForPay } from '@/lib/payments/compute'
import { gigLead, type PositionForAfterGig } from '@/lib/after-gig/rules'
import { resolveVertical } from '@/lib/verticals/registry'
import { isScoped, servicesFor, withScope, type PositionScope } from '@/lib/staffing/scope'

export async function POST(request: Request) {
  const { supabase, membership, error } = await requireOrgAdmin()
  if (error) return error

  try {
    const body = await request.json()
    const { projectId } = body

    // Confirmed positions with their accepted contract offers, and which of the
    // gig's services each chair works (src/lib/staffing/scope.ts).
    const { data: positions, error: positionsError } = await withScope((scope) => {
      const positionsQuery = supabase
        .from('project_positions')
        .select(`
          id,
          musician_id,
          project_id,
          status,
          chair_number${scope},
          instrument:instruments(name),
          projects!inner(
            id,
            name,
            organization_id,
            gig_lead_musician_id,
            organization:organizations(vertical),
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
            first_name,
            last_name,
            email,
            is_leader
          ),
          contract_offers(
            custom_pay,
            status,
            terms_snapshot
          )
        `)
        .eq('status', 'confirmed')
        .not('musician_id', 'is', null)

      return projectId
        ? positionsQuery.eq('project_id', projectId)
        : positionsQuery.eq('projects.organization_id', membership!.organization_id)
    })

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
    // Confirmed chairs with an agreed whole-gig fee that work no services (a
    // chair limited to some services, its last one deleted): a payment row
    // needs a service, so none can be made. Said in the reply, never skipped
    // silently. Always empty for a chair on the whole gig.
    const agreedFeeNoServices: string[] = []

    // Each gig's lead (gigLead: the admin's pick, else the vertical's lead
    // role, Violin 1 chair 1 for music), for labelling older offers that did
    // not record the leader-fee choice.
    const leadByProject = new Map<string, string | null>()
    for (const projectId of new Set(positions.map((p) => p.project_id as string))) {
      const seated = positions.filter((p) => p.project_id === projectId) as unknown as PositionForAfterGig[]
      const project = positions.find((p) => p.project_id === projectId)!.projects as unknown as {
        gig_lead_musician_id: string | null
        organization: { vertical: string | null } | null
      }
      leadByProject.set(
        projectId,
        gigLead(seated, project.gig_lead_musician_id, resolveVertical(project.organization?.vertical).leadFallbackSkill).lead?.musicianId ?? null
      )
    }

    for (const position of positions) {
      const project = position.projects as unknown as {
        id: string
        name: string
        organization_id: string
        gig_lead_musician_id: string | null
        services: Array<{
          id: string
          name: string
          start_time: string | null
          base_pay: number | null
          leader_fee: number | null
        }>
      }

      const musician = position.musician as unknown as { id: string; is_leader: boolean } | null
      const offers = position.contract_offers as unknown as OfferForPay[] | null

      if (!musician || !project.services) continue

      // The accepted offer's custom_pay is the actual agreed amount.
      const offerPay = acceptedOfferPay(offers)

      const includesLeaderFee = acceptedOfferIncludesLeaderFee(offers, leadByProject.get(project.id) === musician.id)

      // Only the services this chair works: all of them unless the chair is
      // limited to some (scope.ts). A whole-gig amount is still owed once,
      // against the first of them.
      const chairServices = servicesFor(position as unknown as PositionScope, project.services)
      if (isScoped(position as unknown as PositionScope) && chairServices.length === 0 && offerPay !== null && offerPay > 0) {
        console.warn(`generate payments: chair ${position.id} has an agreed fee but works no services; no payment made`)
        agreedFeeNoServices.push(position.id)
      }
      for (const line of computeGigPay(chairServices, musician.is_leader, offerPay, includesLeaderFee)) {
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

    // Adds the agreed-fee-but-no-services notice to a reply; a reply with none
    // to report is passed through exactly as it was.
    const reply = (body: { created: number; skipped: number; message: string }) =>
      apiSuccess(
        agreedFeeNoServices.length === 0
          ? body
          : {
              ...body,
              message: `${body.message}. ${agreedFeeNoServices.length} confirmed chair(s) have an agreed fee but are not set to work any service, so no payment was made for them: choose their services, then generate again.`,
              chairs_without_services: agreedFeeNoServices,
            }
      )

    if (paymentsToInsert.length === 0) {
      return reply({
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
      return reply({
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

    return reply({
      created: createdCount,
      skipped: skippedCount,
      message: `Generated ${createdCount} payment records${skippedCount > 0 ? ` (${skippedCount} already existed)` : ''}`,
    })
  } catch (err) {
    console.error('Generate payments error:', err)
    return apiError('Failed to generate payments', 500)
  }
}
