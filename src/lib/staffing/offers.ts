/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST embeds */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { LIVE_OFFER_STATUSES, isLiveOffer } from './live'
import { isOfferClosed } from './respond'
import { DEFAULT_OFFER_EXPIRY, resolveExpiresAt, type OfferExpiry } from './expiry'
import { adminActor, logEvent, type Actor, type StaffingEvent } from './events'
import {
  OFFER_EMAIL_ORG_FIELDS,
  OFFER_EMAIL_SERVICE_FIELDS,
  sendOfferEmail,
  type LeaderFeeChoice,
} from './offer-email'

/**
 * Making an offer: the one server-side path (POST /api/positions/[id]/offers).
 *
 * Offers used to be written by the browser in two places (the Send Offer
 * dialog and the offers list's "next in line" button), each with its own
 * duplicate check, expiry default and status flip, and the step that retires
 * the chair's previous offer lived in a third place, the send-email route, so
 * it only ran when an email was sent (audit C R-1, R-14, R-20). createOffer
 * does all of it, in this order:
 *
 *   1. check: admin of the gig's organization, musician in the same
 *      organization and active, gig not cancelled/completed, chair not already
 *      filled, musician not already holding an offer on this gig;
 *   2. retire the chair's open offers ('superseded'), then insert the new one
 *      (who sent it, what it offered, expiry from the one policy in
 *      expiry.ts) and mark the chair offered;
 *   3. send the email, if asked;
 *   4. if that email failed while someone else was still waiting on the chair,
 *      undo step 2: delete the new offer and put back exactly the offers this
 *      call retired.
 *
 * Retire-then-insert means a chair never holds two live offers, not even for
 * the seconds the email takes: the previous musician cannot accept a chair
 * that is already being offered to someone else, and the planned one-live-
 * offer-per-chair index (094) never sees a second one. Step 4 is the R-14 fix:
 * an old offer is not killed for a call that never went out.
 */

export type OfferDelivery = 'sent' | 'suppressed' | 'failed' | 'no_email' | 'not_requested'

export type CreateOfferRefusal =
  | 'not_found'
  | 'forbidden'
  | 'wrong_organization'
  | 'chair_filled'
  | 'gig_closed'
  | 'musician_inactive'
  | 'musician_has_active_offer'
  | 'chair_has_live_offer'
  | 'send_failed'
  | 'failed'

export interface CreateOfferInput extends LeaderFeeChoice {
  positionId: string
  musicianId: string
  /** Omitted: DEFAULT_OFFER_EXPIRY (48 hours). */
  expiry?: OfferExpiry
  /** The whole-gig fee agreed for this offer; null leaves each service on its own rate. */
  customPay?: number | null
  personalMessage?: string | null
  /** Default true. False creates the offer silently (the admin will contact them). */
  sendEmail?: boolean
}

export type CreateOfferResult =
  | {
      ok: true
      offerId: string
      delivery: OfferDelivery
      /** Why no email went out, when delivery is 'failed' or 'no_email'. */
      emailError?: string
      /** Previously open offers on the chair that this one replaced. */
      superseded: number
    }
  | { ok: false; status: number; code: CreateOfferRefusal; error: string }

const refuse = (status: number, code: CreateOfferRefusal, error: string): CreateOfferResult => ({
  ok: false,
  status,
  code,
  error,
})

/** The no-address message the old send-email route returned; the dialog shows it verbatim. */
export const NO_EMAIL_MESSAGE = 'Musician does not have an email address'

export async function createOffer(
  supabase: SupabaseClient,
  userId: string,
  input: CreateOfferInput
): Promise<CreateOfferResult> {
  const { positionId, musicianId } = input
  const sendEmail = input.sendEmail !== false

  // -- 1. checks ----------------------------------------------------------------

  const { data: position, error: positionError } = await supabase
    .from('project_positions')
    .select(`
      id,
      chair_number,
      musician_id,
      status,
      instrument_id,
      project_id,
      instrument:instruments(id, name),
      project:projects(
        id,
        name,
        status,
        ensemble_type,
        organization_id,
        organization:organizations(${OFFER_EMAIL_ORG_FIELDS}),
        services(${OFFER_EMAIL_SERVICE_FIELDS})
      )
    `)
    .eq('id', positionId)
    .single()

  if (positionError || !position) return refuse(404, 'not_found', 'Position not found')

  const pos = position as any
  const project = pos.project
  const organizationId: string | undefined = project?.organization_id

  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .single()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return refuse(403, 'forbidden', 'Permission denied')
  }

  const { data: musician, error: musicianError } = await supabase
    .from('musicians')
    .select('id, first_name, last_name, email, organization_id, is_active')
    .eq('id', musicianId)
    .single()

  if (musicianError || !musician) return refuse(404, 'not_found', 'Musician not found')
  if (musician.organization_id !== organizationId) {
    return refuse(400, 'wrong_organization', 'Musician does not belong to this organization')
  }
  if (isOfferClosed(project, null)) {
    return refuse(409, 'gig_closed', 'This gig is cancelled or completed, so no new offers can go out')
  }
  if (isOfferClosed(null, musician)) {
    return refuse(409, 'musician_inactive', `${musician.first_name} ${musician.last_name} is inactive`)
  }
  // An accept on a held chair is refused (claimChairForAccept), so an offer
  // here could never be taken up.
  if (pos.musician_id) return refuse(409, 'chair_filled', 'This chair is already filled')

  // The dialogs' duplicate check, unchanged: an offer of any open or accepted
  // kind for this musician anywhere on the gig, this chair included.
  const { data: projectPositions } = await supabase
    .from('project_positions')
    .select('id')
    .eq('project_id', pos.project_id)
  const allPosIds = (projectPositions || []).map((p: { id: string }) => p.id)
  if (allPosIds.length > 0) {
    const { data: existingActive } = await supabase
      .from('contract_offers')
      .select('id')
      .eq('musician_id', musicianId)
      .in('project_position_id', allPosIds)
      .in('status', ['pending', 'viewed', 'accepted'])
      .limit(1)
    if (existingActive && existingActive.length > 0) {
      return refuse(409, 'musician_has_active_offer', 'This musician already has an active offer on this gig')
    }
  }

  // Whoever else is waiting on this chair, and in what state, so a failed send
  // can put them back exactly as they were.
  const { data: siblingRows } = await supabase
    .from('contract_offers')
    .select('id, status, expires_at')
    .eq('project_position_id', positionId)
    .in('status', [...LIVE_OFFER_STATUSES])
  const siblings: { id: string; status: string; expires_at: string | null }[] = siblingRows || []

  // -- 2. the offer ---------------------------------------------------------------

  const service = createServiceClient()

  // Retire first, so the chair never holds two live offers (see the header).
  const retired = await supersedeLiveOffers(service, positionId)
  if (retired.error) {
    console.error(`createOffer: could not retire earlier offers on position ${positionId}; offer not created:`, retired.error)
    return refuse(500, 'failed', 'Could not replace the chair\'s current offer, so no new offer was made. Please try again.')
  }
  const previousStatus = new Map(siblings.map((o) => [o.id, o.status]))
  const putBack = () => restoreSuperseded(service, positionId, retired, previousStatus)

  const services: any[] = project?.services || []
  const nowIso = new Date().toISOString()
  const expiresAt = resolveExpiresAt(input.expiry ?? DEFAULT_OFFER_EXPIRY)
  const personalMessage = input.personalMessage?.trim() || null
  const willEmail = sendEmail && !!musician.email

  const base: Record<string, unknown> = {
    project_position_id: positionId,
    musician_id: musicianId,
    status: 'pending',
    sent_at: nowIso,
    expires_at: expiresAt,
    custom_pay: input.customPay ?? null,
  }
  if (personalMessage) base.personal_message = personalMessage

  const { data: offer, error: insertError } = await insertOffer(supabase, base, {
    created_by: userId,
    terms_snapshot: termsSnapshot(pos, services, input, nowIso),
    delivery_status: willEmail ? 'queued' : null,
  })
  if (insertError || !offer) {
    console.error(`createOffer: insert failed for musician ${musicianId} on position ${positionId}:`, insertError)
    await putBack()
    if ((insertError as { code?: string } | null)?.code === '23505') {
      // Another admin's offer for this chair landed between our two writes (094's index).
      return refuse(409, 'chair_has_live_offer', 'Another offer for this chair was sent a moment ago. Refresh to see it.')
    }
    return refuse(500, 'failed', (insertError as any)?.message || 'Failed to create offer')
  }

  // Advisory only (the open-chair test also reads live offers); never
  // overwrites a chair someone confirmed in the meantime.
  const { error: posUpdateError } = await supabase
    .from('project_positions')
    .update({ status: 'offered' })
    .eq('id', positionId)
    .neq('status', 'confirmed')
  if (posUpdateError) console.error(`createOffer: could not mark position ${positionId} offered:`, posUpdateError)

  // -- 3. the email ---------------------------------------------------------------

  let delivery: OfferDelivery = 'not_requested'
  let emailError: string | undefined
  if (sendEmail) {
    try {
      const sent = await sendOfferEmail(
        supabase,
        {
          offer: { ...offer, personal_message: personalMessage },
          musician,
          position: pos,
          project,
          organization: project?.organization,
          instrument: pos.instrument,
          services,
        },
        { includeLeaderFee: input.includeLeaderFee, leaderFeeAmount: input.leaderFeeAmount }
      )
      delivery = sent.delivery
      if (sent.delivery === 'no_email') emailError = NO_EMAIL_MESSAGE
    } catch (err) {
      delivery = 'failed'
      emailError = err instanceof Error ? err.message : 'Failed to send email'
      console.error(`createOffer: offer email to musician ${musicianId} failed:`, err)
    }
  }

  // -- 4. a failed send while someone else was waiting: undo ------------------------

  // "Waiting" means still answerable: an offer past its deadline that the cron
  // has not collected yet loses nothing by being replaced.
  const now = new Date()
  const retiredIds = new Set(retired.offers.map((o) => o.id))
  const someoneWaiting = siblings.some((o) => retiredIds.has(o.id) && isLiveOffer(o, now))

  if (delivery === 'failed' && someoneWaiting) {
    // R-14: this call never reached anyone. Take the new offer back (nobody has
    // its link) and give the previous musician their offer back.
    const { error: withdrawError } = await service.from('contract_offers').delete().eq('id', offer.id)
    if (!withdrawError) {
      const restored = await putBack()
      console.warn(
        `createOffer: email to musician ${musicianId} failed; withdrew offer ${offer.id} and restored ${restored} earlier offer(s) on position ${positionId}`
      )
      return refuse(
        502,
        'send_failed',
        `The email to ${musician.first_name} ${musician.last_name} could not be sent (${emailError}), so the offer was not created. The chair's current offer is still open.`
      )
    }
    // Putting the old offer back now would leave two live offers; keep the new
    // one (the admin is told its email failed, and can Send Reminder).
    console.error(`createOffer: could not withdraw unsent offer ${offer.id}; leaving it pending:`, withdrawError)
  }

  if (willEmail && delivery !== 'no_email') {
    const { error: deliveryError } = await service
      .from('contract_offers')
      .update({ delivery_status: delivery })
      .eq('id', offer.id)
    if (deliveryError) console.error(`createOffer: could not record delivery for offer ${offer.id}:`, deliveryError)
  }

  const actor = adminActor(userId)
  const events: StaffingEvent[] = supersededEvents(retired, {
    organizationId,
    actor,
    positionId,
    replacedBy: offer.id,
  })
  events.push({
    organizationId,
    actor,
    entityType: 'offer',
    entityId: offer.id,
    action: 'offer.sent',
    after: {
      status: 'pending',
      position_id: positionId,
      musician_id: musicianId,
      expires_at: offer.expires_at ?? expiresAt,
      delivery,
    },
  })
  await logEvent(events)

  return { ok: true, offerId: offer.id, delivery, ...(emailError ? { emailError } : {}), superseded: retired.offers.length }
}

/**
 * Undo createOffer's retire step: put each offer it retired back to the
 * status it had (pending or viewed), only while it still carries the status
 * this call gave it. Returns how many came back. Under 094's index a restore
 * that would make a second live offer is refused; that is logged and left.
 */
async function restoreSuperseded(
  service: SupabaseClient,
  positionId: string,
  retired: SupersedeResult,
  previousStatus: Map<string, string>
): Promise<number> {
  let restored = 0
  for (const status of LIVE_OFFER_STATUSES) {
    const ids = retired.offers.map((o) => o.id).filter((id) => (previousStatus.get(id) ?? 'pending') === status)
    if (ids.length === 0) continue
    const { data, error } = await service
      .from('contract_offers')
      .update({ status, responded_at: null })
      .eq('project_position_id', positionId)
      .in('id', ids)
      .eq('status', retired.status)
      .select('id')
    if (error) console.error(`createOffer: could not restore offers ${ids.join(', ')} on position ${positionId}:`, error)
    restored += data?.length ?? 0
  }
  return restored
}

// ---------------------------------------------------------------------------
// Superseding: retiring a chair's open offers because something replaced them
// ---------------------------------------------------------------------------

export interface SupersedeScope {
  /** Leave this offer alone (the one doing the replacing). */
  exceptOfferId?: string
  /** Only this musician's offers (a substitute's own earlier offer). */
  onlyMusicianId?: string
  /** Everyone's but this musician's (the musician just seated directly). */
  exceptMusicianId?: string
}

export interface SupersedeResult {
  offers: { id: string; musician_id: string }[]
  /** 'superseded', or 'expired' when migration 093 is not applied yet. */
  status: 'superseded' | 'expired'
  error: unknown | null
}

/**
 * Retire the chair's open offers (pending/viewed) that `scope` selects, as
 * 'superseded' with responded_at now. The one writer for "replaced": a new
 * offer (createOffer, and the old send-email route), a direct assignment, a
 * substitute's re-approval. Before 093 is pasted the database refuses the new
 * status (23514); the offers are then retired as 'expired', which is what all
 * three writers did before.
 */
export async function supersedeLiveOffers(
  supabase: SupabaseClient,
  positionId: string,
  scope: SupersedeScope = {}
): Promise<SupersedeResult> {
  const attempt = async (status: 'superseded' | 'expired') => {
    let q = supabase
      .from('contract_offers')
      .update({ status, responded_at: new Date().toISOString() })
      .eq('project_position_id', positionId)
    if (scope.exceptOfferId) q = q.neq('id', scope.exceptOfferId)
    if (scope.onlyMusicianId) q = q.eq('musician_id', scope.onlyMusicianId)
    if (scope.exceptMusicianId) q = q.neq('musician_id', scope.exceptMusicianId)
    return q.in('status', [...LIVE_OFFER_STATUSES]).select('id, musician_id')
  }

  const first = await attempt('superseded')
  if (first.error && (first.error as { code?: string }).code === '23514') {
    console.error(`contract_offers refused status 'superseded' (migration 093 not applied?); retiring offers on position ${positionId} as 'expired'`)
    const fallback = await attempt('expired')
    return { offers: fallback.data || [], status: 'expired', error: fallback.error }
  }
  return { offers: first.data || [], status: 'superseded', error: first.error }
}

/** One offer.superseded history row per retired offer. */
export function supersededEvents(
  result: SupersedeResult,
  ctx: {
    organizationId: string | null | undefined
    actor: Actor
    positionId?: string
    replacedBy?: string
    reason?: string
  }
): StaffingEvent[] {
  return result.offers.map((other) => ({
    organizationId: ctx.organizationId,
    actor: ctx.actor,
    entityType: 'offer' as const,
    entityId: other.id,
    action: 'offer.superseded' as const,
    after: {
      status: result.status,
      ...(ctx.positionId ? { position_id: ctx.positionId } : {}),
      musician_id: other.musician_id,
      ...(ctx.replacedBy ? { replaced_by: ctx.replacedBy } : {}),
      ...(ctx.reason ? { reason: ctx.reason } : {}),
    },
  }))
}

// ---------------------------------------------------------------------------
// Inserting an offer row
// ---------------------------------------------------------------------------

/** The 093 columns: who sent it, what it offered, how the email went, substitute or not. */
export interface OfferTrackingColumns {
  created_by?: string | null
  terms_snapshot?: Record<string, unknown> | null
  delivery_status?: 'queued' | 'sent' | 'failed' | 'suppressed' | null
  is_substitution?: boolean
}

/** PostgREST "column not in schema cache" or Postgres "undefined column". */
function isMissingColumn(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === 'PGRST204' || code === '42703'
}

/**
 * Insert an offer with its 093 tracking columns. If the database does not have
 * those columns yet (093 not pasted), insert it without them rather than fail
 * to make the offer at all, and say so in the logs.
 */
export async function insertOffer(
  supabase: SupabaseClient,
  base: Record<string, unknown>,
  tracking: OfferTrackingColumns
): Promise<{ data: any; error: unknown }> {
  const returning = 'id, token, expires_at, custom_pay, personal_message'
  const first = await supabase.from('contract_offers').insert({ ...base, ...tracking }).select(returning).single()
  if (!first.error || !isMissingColumn(first.error)) return { data: first.data, error: first.error }

  console.error('contract_offers is missing the 093 columns (migration 093 not applied?); inserting the offer without them:', first.error)
  const retry = await supabase.from('contract_offers').insert(base).select(returning).single()
  return { data: retry.data, error: retry.error }
}

/**
 * What the musician is being offered, frozen at send time: the gig's services
 * (all of them; per-chair service scoping is a later step) and the pay inputs
 * exactly as the admin set them. Pay is recorded, never recomputed here.
 */
export function termsSnapshot(
  position: any,
  services: any[],
  input: Pick<CreateOfferInput, 'customPay' | 'includeLeaderFee' | 'leaderFeeAmount'>,
  capturedAt: string
): Record<string, unknown> {
  const includeLeaderFee = input.includeLeaderFee == null ? null : !!input.includeLeaderFee
  return {
    captured_at: capturedAt,
    position: {
      id: position?.id ?? null,
      instrument: position?.instrument?.name ?? null,
      chair_number: position?.chair_number ?? null,
    },
    pay: {
      custom_pay: input.customPay ?? null,
      include_leader_fee: includeLeaderFee,
      leader_fee_amount: includeLeaderFee ? Number(input.leaderFeeAmount ?? 0) : null,
    },
    services: [...services]
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .map((s) => ({
        id: s.id,
        name: s.name ?? null,
        service_type: s.service_type ?? null,
        call_time: s.call_time ?? null,
        start_time: s.start_time ?? null,
        end_time: s.end_time ?? null,
        venue: s.venue ?? null,
        venue_id: s.venue_id ?? null,
        venue_2: s.venue_2 ?? null,
        venue_id_2: s.venue_id_2 ?? null,
        base_pay: s.base_pay ?? null,
        leader_fee: s.leader_fee ?? null,
      })),
  }
}
