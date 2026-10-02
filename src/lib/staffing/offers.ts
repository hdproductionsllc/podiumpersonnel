/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST embeds */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { LIVE_OFFER_STATUSES, isLiveOffer } from './live'
import { DEFAULT_OFFER_EXPIRY, resolveExpiresAt, type OfferExpiry } from './expiry'
import { adminActor, logEvent, type Actor, type StaffingEvent } from './events'
import { MIGRATION_094_MISSING, isMissingFunction } from './rpc'
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
 *   1. read the chair and the musician (the email needs them);
 *   2. create_offer, a database function (migration 094), in ONE transaction:
 *      check (admin of the gig's organization, musician in the same
 *      organization and active, gig not cancelled/completed, chair not
 *      already filled, musician not already holding an offer on this gig),
 *      retire the chair's open offers ('superseded'), insert the new one (who
 *      sent it, what it offered, expiry from the one policy in expiry.ts),
 *      mark the chair offered, and record it in staffing_events;
 *   3. send the email, if asked;
 *   4. if that email failed while someone else was still waiting on the chair,
 *      undo step 2: delete the new offer and put back exactly the offers it
 *      retired.
 *
 * Retire-then-insert inside one transaction means a chair never holds two
 * live offers, not even for the seconds the email takes, and two admins
 * sending at once queue on the chair's lock instead of interleaving; the
 * one-live-offer-per-chair index (095, pasted after this code is live) is the
 * backstop. Step 4 is the R-14 fix: an old offer is not killed for a call
 * that never went out.
 *
 * If 094 is not applied the function does not exist and no offer is made
 * (503, logged): see rpc.ts for why there is no fallback.
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
  | 'not_ready'
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

/** An offer create_offer retired, as it was just before. */
interface RetiredOffer {
  id: string
  musician_id: string
  previous_status: string
  expires_at: string | null
  /**
   * A substitute's offer. create_offer closes its substitution request, and it
   * could never have been accepted on an empty chair, so it is not put back.
   */
  is_substitution?: boolean
}

type RpcRefusal = Exclude<CreateOfferRefusal, 'send_failed' | 'not_ready' | 'failed'>

/** What create_offer returns (see its comment in migration 094). */
type CreateOfferRpcResult =
  | {
      result: 'created'
      offer: { id: string; token: string; expires_at: string | null; custom_pay: number | null; personal_message: string | null }
      superseded: RetiredOffer[]
    }
  | { result: RpcRefusal; what?: 'position' | 'musician' }

export async function createOffer(
  supabase: SupabaseClient,
  userId: string,
  input: CreateOfferInput
): Promise<CreateOfferResult> {
  const { positionId, musicianId } = input
  const sendEmail = input.sendEmail !== false

  // -- 1. what the email needs ------------------------------------------------------

  // The admin's own session: a chair outside their organization reads as not found.
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

  const { data: musician, error: musicianError } = await supabase
    .from('musicians')
    .select('id, first_name, last_name, email, organization_id, is_active')
    .eq('id', musicianId)
    .maybeSingle()

  // The email needs this row. Refuse now, before anything is written, rather
  // than make an offer that cannot be sent (and retire the chair's current one).
  if (musicianError) {
    console.error(`createOffer: could not read musician ${musicianId}; nothing changed:`, musicianError)
    return refuse(500, 'failed', 'Failed to create offer')
  }

  // -- 2. the offer, in one transaction ---------------------------------------------

  const service = createServiceClient()
  const services: any[] = project?.services || []
  const nowIso = new Date().toISOString()
  const expiresAt = resolveExpiresAt(input.expiry ?? DEFAULT_OFFER_EXPIRY)
  const personalMessage = input.personalMessage?.trim() || null
  const willEmail = sendEmail && !!musician?.email

  const { data: rpcData, error: rpcError } = await service.rpc('create_offer', {
    p_position_id: positionId,
    p_musician_id: musicianId,
    p_created_by: userId,
    p_expires_at: expiresAt,
    p_custom_pay: input.customPay ?? null,
    p_personal_message: personalMessage,
    p_terms_snapshot: termsSnapshot(pos, services, input, nowIso),
    p_delivery_status: willEmail ? 'queued' : null,
    p_supersede: true,
  })

  if (rpcError) {
    if (isMissingFunction(rpcError, 'create_offer')) {
      console.error(`createOffer: offer for musician ${musicianId} on position ${positionId} refused: ${MIGRATION_094_MISSING}`)
      return refuse(503, 'not_ready', 'Offers cannot be sent until a database update is applied. Nothing was changed.')
    }
    console.error(`createOffer: create_offer failed for musician ${musicianId} on position ${positionId}:`, rpcError)
    if ((rpcError as { code?: string }).code === '23505') {
      // Another writer's offer for this chair landed first (095's index).
      return refuse(409, 'chair_has_live_offer', 'Another offer for this chair was sent a moment ago. Refresh to see it.')
    }
    return refuse(500, 'failed', (rpcError as any)?.message || 'Failed to create offer')
  }

  const created = rpcData as CreateOfferRpcResult | null
  if (!created || created.result !== 'created') {
    return refusal(created, musician)
  }

  const offer = created.offer
  const retired = created.superseded || []
  const actor = adminActor(userId)

  if (!musician) {
    // create_offer found the musician, but the admin's own read did not (the
    // row is not visible to them): there is nobody to email. Undo it, as for a
    // failed send, so the chair is exactly as it was.
    console.error(`createOffer: create_offer made offer ${offer.id} but musician ${musicianId} could not be read; undoing it`)
    await undoOffer(service, { organizationId, actor, positionId, musicianId, offerId: offer.id, retired, reason: 'musician_unreadable' })
    return refuse(500, 'failed', 'Failed to create offer')
  }

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
  const someoneWaiting = restorable(retired).some((o) =>
    isLiveOffer({ status: o.previous_status, expires_at: o.expires_at }, now)
  )

  if (delivery === 'failed' && someoneWaiting) {
    // R-14: this call never reached anyone. Take the new offer back (nobody has
    // its link) and give the previous musician their offer back.
    const restored = await undoOffer(service, {
      organizationId,
      actor,
      positionId,
      musicianId,
      offerId: offer.id,
      retired,
      reason: 'send_failed',
    })
    if (restored) {
      console.warn(
        `createOffer: email to musician ${musicianId} failed; withdrew offer ${offer.id} and restored ${restored.length} earlier offer(s) on position ${positionId}`
      )
      return refuse(
        502,
        'send_failed',
        `The email to ${musician.first_name} ${musician.last_name} could not be sent (${emailError}), so the offer was not created. The chair's current offer is still open.`
      )
    }
    // Putting the old offer back now would leave two live offers; keep the new
    // one (the admin is told its email failed, and can Send Reminder).
  }

  if (willEmail && delivery !== 'no_email') {
    const { error: deliveryError } = await service
      .from('contract_offers')
      .update({ delivery_status: delivery })
      .eq('id', offer.id)
    if (deliveryError) console.error(`createOffer: could not record delivery for offer ${offer.id}:`, deliveryError)
  }

  // create_offer recorded the offer and what it replaced; this records how the email went.
  await logEvent({
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

  return { ok: true, offerId: offer.id, delivery, ...(emailError ? { emailError } : {}), superseded: retired.length }
}

/** create_offer said no: the status and words the admin sees (unchanged from the old checks). */
function refusal(
  rpc: CreateOfferRpcResult | null,
  musician: { first_name?: string; last_name?: string } | null
): CreateOfferResult {
  const result = rpc?.result
  switch (result) {
    case 'not_found':
      return rpc?.what === 'musician'
        ? refuse(404, 'not_found', 'Musician not found')
        : refuse(404, 'not_found', 'Position not found')
    case 'forbidden':
      return refuse(403, 'forbidden', 'Permission denied')
    case 'wrong_organization':
      return refuse(400, 'wrong_organization', 'Musician does not belong to this organization')
    case 'gig_closed':
      return refuse(409, 'gig_closed', 'This gig is cancelled or completed, so no new offers can go out')
    case 'musician_inactive':
      return refuse(409, 'musician_inactive', `${musician?.first_name} ${musician?.last_name} is inactive`)
    case 'chair_filled':
      return refuse(409, 'chair_filled', 'This chair is already filled')
    case 'musician_has_active_offer':
      return refuse(409, 'musician_has_active_offer', 'This musician already has an active offer on this gig')
    case 'chair_has_live_offer':
      return refuse(409, 'chair_has_live_offer', 'Another offer for this chair was sent a moment ago. Refresh to see it.')
    default:
      // A shape this code does not know.
      console.error('createOffer: create_offer returned an unexpected result:', rpc)
      return refuse(500, 'failed', 'Failed to create offer')
  }
}

/** The retired offers that may be put back: not substitutes' (see RetiredOffer). */
function restorable(retired: RetiredOffer[]): RetiredOffer[] {
  return retired.filter((o) => o.is_substitution !== true)
}

interface UndoContext {
  organizationId: string | undefined
  actor: Actor
  positionId: string
  musicianId: string
  offerId: string
  retired: RetiredOffer[]
  reason: 'send_failed' | 'musician_unreadable'
}

/**
 * Undo create_offer: delete the new offer (nobody has its link) and put back
 * the offers it retired, recording both. Returns the offers put back, or null
 * when the new offer could not be deleted; then nothing is put back, since
 * that would leave two live offers on the chair.
 */
async function undoOffer(service: SupabaseClient, ctx: UndoContext): Promise<RetiredOffer[] | null> {
  const { error: withdrawError } = await service.from('contract_offers').delete().eq('id', ctx.offerId)
  if (withdrawError) {
    console.error(`createOffer: could not withdraw offer ${ctx.offerId}; leaving it pending:`, withdrawError)
    return null
  }
  const restored = await restoreSuperseded(service, ctx.positionId, restorable(ctx.retired))
  await reopenChairIfNothingLive(service, ctx.positionId)
  await logEvent(withdrawnEvents({ ...ctx, restored }))
  return restored
}

/**
 * create_offer marked the chair 'offered'. With the new offer withdrawn and
 * nothing live left on it, put an empty chair back to 'vacant' so it does not
 * read as out on offer. Guarded so a chair someone holds is never touched.
 */
async function reopenChairIfNothingLive(service: SupabaseClient, positionId: string): Promise<void> {
  const { data: live, error: liveError } = await service
    .from('contract_offers')
    .select('id')
    .eq('project_position_id', positionId)
    .in('status', [...LIVE_OFFER_STATUSES])
    .limit(1)
  if (liveError) {
    console.error(`createOffer: could not check chair ${positionId} after withdrawing an offer:`, liveError)
    return
  }
  if (live && live.length > 0) return

  const { error } = await service
    .from('project_positions')
    .update({ status: 'vacant' })
    .eq('id', positionId)
    .eq('status', 'offered')
    .is('musician_id', null)
  if (error) {
    console.error(`createOffer: could not reopen chair ${positionId} after withdrawing an offer:`, error)
  }
}

/** The history of a withdrawn offer: it was taken back, and what it replaced came back. */
function withdrawnEvents(ctx: Omit<UndoContext, 'retired'> & { restored: RetiredOffer[] }): StaffingEvent[] {
  return [
    {
      organizationId: ctx.organizationId,
      actor: ctx.actor,
      entityType: 'offer',
      entityId: ctx.offerId,
      action: 'offer.withdrawn',
      before: { status: 'pending' },
      after: { reason: ctx.reason, position_id: ctx.positionId, musician_id: ctx.musicianId },
    },
    ...ctx.restored.map(
      (o): StaffingEvent => ({
        organizationId: ctx.organizationId,
        actor: ctx.actor,
        entityType: 'offer',
        entityId: o.id,
        action: 'offer.restored',
        before: { status: 'superseded' },
        after: { status: o.previous_status, position_id: ctx.positionId, musician_id: o.musician_id, withdrawn: ctx.offerId },
      })
    ),
  ]
}

/**
 * Undo create_offer's retire step: put each offer it retired back to the
 * status it had (pending or viewed), only while it still says 'superseded'.
 * Returns the ones that came back. Under 095's index a restore that would make
 * a second live offer is refused; that is logged and left.
 */
async function restoreSuperseded(
  service: SupabaseClient,
  positionId: string,
  retired: RetiredOffer[]
): Promise<RetiredOffer[]> {
  const restored: RetiredOffer[] = []
  for (const status of LIVE_OFFER_STATUSES) {
    const group = retired.filter((o) => o.previous_status === status)
    if (group.length === 0) continue
    const ids = group.map((o) => o.id)
    const { data, error } = await service
      .from('contract_offers')
      .update({ status, responded_at: null })
      .eq('project_position_id', positionId)
      .in('id', ids)
      .eq('status', 'superseded')
      .select('id')
    if (error) console.error(`createOffer: could not restore offers ${ids.join(', ')} on position ${positionId}:`, error)
    const back = new Set((data || []).map((r: { id: string }) => r.id))
    restored.push(...group.filter((o) => back.has(o.id)))
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
