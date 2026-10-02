import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrgAdminEmails } from '@/lib/supabase/server'
import { formatPerformanceDateForSubject, sendCascadeExhaustedEmail } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import type { AutoOfferNote } from '@/lib/email/templates/auto-offer-note'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'
import { logEvent, SYSTEM } from './events'
import { sendOfferEmail } from './offer-email'
import { termsSnapshot, type OfferDelivery } from './offers'
import { countChairs } from './respond'
import { isMissingFunction } from './rpc'
import { getOrgStaffingSettings } from './settings'
import { planCascade, type CascadeContext, type CascadePlan, type CascadeSkipReason } from './cascade-plan'

export { planCascade, rankForCascade, cascadeTerms, type CascadeSkipReason, type CascadePlan } from './cascade-plan'

/**
 * The auto-cascade (plan, Release 1 B1.1; target architecture section 4):
 * when an offer ends without the chair being filled, offer the chair to the
 * next person on the call list, on the same terms, by itself.
 *
 * advance() is the one entry point. It is called AFTER the ending has been
 * recorded, by:
 *
 *   - the musician's decline (POST /api/gig/[token]/decline)   trigger 'declined'
 *   - the expire cron (GET /api/cron/expire-offers)            trigger 'expired'
 *   - a worker dropping out (step C)                            trigger 'dropped'
 *
 * Never by an admin's rescind or a supersede: the admin is acting. Never for a
 * substitute's offer: the chair is still the original musician's.
 *
 * It returns one of
 *
 *   offered    the next musician was offered the chair and emailed
 *   exhausted  nobody is left who is free; the admins were emailed once
 *   skipped    nothing to do, with the reason (CascadeSkipReason)
 *
 * and never throws: a failure here must never undo or fail the musician's
 * decline, or stop the cron for the other offers. Failures are logged and come
 * back as skipped('error').
 *
 * Safety lives in the database (migration 096): cascade_offer and
 * mark_cascade_exhausted lock the chair and re-check every reason to stop
 * (cascade_refusal), and the unique index on cascaded_from_offer_id means one
 * ended offer causes at most one automatic offer however many callers race.
 * planCascade's reading of the same rules is for choosing who to ask, and for
 * the preview script.
 *
 * With the organization's auto_cascade off nothing is written, logged or sent.
 */

export type CascadeTrigger = 'declined' | 'expired' | 'dropped'

export interface AdvanceInput {
  positionId: string
  triggerOfferId: string
  trigger: CascadeTrigger
}

export type AdvanceResult =
  | {
      outcome: 'offered'
      offerId: string
      musician: { id: string; first_name: string; last_name: string; email: string }
      expiresAt: string | null
      delivery: OfferDelivery
    }
  | { outcome: 'exhausted'; notified: boolean }
  | { outcome: 'skipped'; reason: CascadeSkipReason }

/** Skips worth no history row: the organization never asked for the cascade. */
const QUIET_SKIPS: readonly CascadeSkipReason[] = ['auto_off', 'not_ready']

/**
 * How many times to re-plan when the musician chosen became unavailable
 * between choosing and offering (offered elsewhere on the gig, deactivated).
 */
const MAX_ATTEMPTS = 3

/** Refusals from cascade_offer that are about the musician, not the chair: ask the next one. */
const MUSICIAN_REFUSALS = ['musician_not_found', 'wrong_organization', 'musician_inactive', 'musician_has_active_offer']

const MIGRATION_096_MISSING =
  'database function missing: migration 096 (scripts/sql/096-auto-cascade-settings.paste.sql) has not been applied'

export async function advance(service: SupabaseClient, input: AdvanceInput): Promise<AdvanceResult> {
  let organizationId: string | undefined
  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const plan = await planCascade(service, input)
      organizationId = (plan.kind === 'skip' ? plan.organizationId : undefined) ?? plan.context?.project?.organization_id ?? organizationId

      if (plan.kind === 'skip') return await skipped(input, plan.reason, organizationId)
      if (plan.kind === 'exhausted') return await exhaust(service, input, plan)

      const made = await offerNext(service, input, plan)
      if (made !== 'ask_next') return made
    }
    console.error(`cascade: offer ${input.triggerOfferId}: gave up after ${MAX_ATTEMPTS} musicians became unavailable`)
    return await skipped(input, 'error', organizationId, { detail: 'candidates_kept_becoming_unavailable' })
  } catch (err) {
    console.error(`cascade: offer ${input.triggerOfferId} on position ${input.positionId} failed; nothing more was done:`, err)
    return skipped(input, 'error', organizationId, { detail: err instanceof Error ? err.message : String(err) }).catch(() => ({
      outcome: 'skipped' as const,
      reason: 'error' as const,
    }))
  }
}

/** Whether this organization has auto-offer on (false when it cannot be read). */
export async function isAutoCascadeOn(service: SupabaseClient, organizationId: string | null | undefined): Promise<boolean> {
  if (!organizationId) return false
  return (await getOrgStaffingSettings(service, organizationId))?.autoCascade === true
}

/**
 * What to tell the admins in their decline / expiry notice, or undefined when
 * Podium did nothing (the notice is then exactly as it always was).
 */
export function autoOfferNote(result: AdvanceResult | null | undefined, timezone?: string | null): AutoOfferNote | undefined {
  if (!result) return undefined
  if (result.outcome === 'offered') {
    return {
      kind: 'offered',
      musicianName: `${result.musician.first_name} ${result.musician.last_name}`,
      expiresAt: result.expiresAt,
      timezone: timezone || DEFAULT_TIMEZONE,
      ...(result.delivery === 'failed' ? { emailFailed: true } : {}),
    }
  }
  if (result.outcome === 'exhausted') return { kind: 'exhausted' }
  return undefined
}

// ---------------------------------------------------------------------------

async function skipped(
  input: AdvanceInput,
  reason: CascadeSkipReason,
  organizationId: string | undefined,
  extra: Record<string, unknown> = {}
): Promise<AdvanceResult> {
  if (!QUIET_SKIPS.includes(reason)) {
    await logEvent({
      organizationId,
      actor: SYSTEM,
      entityType: 'offer',
      entityId: input.triggerOfferId,
      action: 'cascade.skipped',
      after: { reason, trigger: input.trigger, position_id: input.positionId, ...extra },
    })
  }
  return { outcome: 'skipped', reason }
}

type OfferPlan = Extract<CascadePlan, { kind: 'offer' }>
type ExhaustedPlan = Extract<CascadePlan, { kind: 'exhausted' }>

type CascadeOfferRpcResult =
  | {
      result: 'created'
      offer: { id: string; token: string; expires_at: string | null; custom_pay: number | null; personal_message: string | null }
    }
  | { result: string }

/** Offer the chair to the planned musician and email them. 'ask_next' when they became unavailable. */
async function offerNext(service: SupabaseClient, input: AdvanceInput, plan: OfferPlan): Promise<AdvanceResult | 'ask_next'> {
  const { context, musician, terms } = plan
  const organizationId: string | undefined = context.project?.organization_id
  const leaderFee = { includeLeaderFee: terms.includeLeaderFee, leaderFeeAmount: terms.leaderFeeAmount }

  const snapshot = {
    ...termsSnapshot(context.position, context.services, { customPay: terms.customPay, ...leaderFee }, new Date().toISOString()),
    cascade: { from_offer_id: input.triggerOfferId, trigger: input.trigger },
  }

  const { data, error } = await service.rpc('cascade_offer', {
    p_trigger_offer_id: input.triggerOfferId,
    p_musician_id: musician.id,
    p_expires_at: terms.expiresAt,
    p_custom_pay: terms.customPay,
    p_terms_snapshot: snapshot,
    p_delivery_status: 'queued',
  })

  if (error) {
    if (isMissingFunction(error, 'cascade_offer')) {
      console.error(`cascade: offer ${input.triggerOfferId}: ${MIGRATION_096_MISSING}`)
      return skipped(input, 'not_ready', organizationId)
    }
    if ((error as { code?: string }).code === '23505') return skipped(input, 'already_cascaded', organizationId)
    throw error
  }

  const created = data as CascadeOfferRpcResult | null
  if (!created || created.result !== 'created' || !('offer' in created)) {
    const reason = created?.result
    if (reason && MUSICIAN_REFUSALS.includes(reason)) return 'ask_next'
    return skipped(input, (reason as CascadeSkipReason) || 'error', organizationId)
  }

  const offer = created.offer

  // The email: the very one an admin's offer sends (offer-email.ts), with the
  // ended offer's leader-fee choice.
  let delivery: OfferDelivery
  try {
    const sent = await sendOfferEmail(
      service,
      {
        offer,
        musician,
        position: context.position,
        project: context.project,
        organization: context.organization,
        instrument: context.instrument,
        services: context.services,
      },
      leaderFee
    )
    delivery = sent.delivery
  } catch (err) {
    delivery = 'failed'
    console.error(`cascade: offer email to musician ${musician.id} (offer ${offer.id}) failed; the offer stands:`, err)
  }

  if (delivery !== 'no_email') {
    const { error: deliveryError } = await service.from('contract_offers').update({ delivery_status: delivery }).eq('id', offer.id)
    if (deliveryError) console.error(`cascade: could not record delivery for offer ${offer.id}:`, deliveryError)
  }

  // cascade_offer recorded offer.created and cascade.offered; this records how the email went.
  await logEvent({
    organizationId,
    actor: SYSTEM,
    entityType: 'offer',
    entityId: offer.id,
    action: 'offer.sent',
    after: {
      status: 'pending',
      position_id: input.positionId,
      musician_id: musician.id,
      expires_at: offer.expires_at,
      delivery,
      cascaded_from_offer_id: input.triggerOfferId,
      skipped_conflicts: plan.skippedConflicts,
    },
  })

  return {
    outcome: 'offered',
    offerId: offer.id,
    musician: { id: musician.id, first_name: musician.first_name, last_name: musician.last_name, email: musician.email },
    expiresAt: offer.expires_at,
    delivery,
  }
}

/** Nobody left: claim the one "please pick someone" email for this ended offer, then send it. */
async function exhaust(service: SupabaseClient, input: AdvanceInput, plan: ExhaustedPlan): Promise<AdvanceResult> {
  const { context } = plan
  const project = context.project
  const organizationId: string | undefined = project?.organization_id

  const { data, error } = await service.rpc('mark_cascade_exhausted', { p_trigger_offer_id: input.triggerOfferId })
  if (error) {
    if (isMissingFunction(error, 'mark_cascade_exhausted')) {
      console.error(`cascade: offer ${input.triggerOfferId}: ${MIGRATION_096_MISSING}`)
      return skipped(input, 'not_ready', organizationId)
    }
    throw error
  }
  if (data !== 'marked') return skipped(input, (data as CascadeSkipReason) || 'error', organizationId)

  // mark_cascade_exhausted recorded cascade.exhausted. From here on, a failure
  // means the admins are not told; it is logged, and never retried into a second email.
  const adminEmails = organizationId ? await getOrgAdminEmails(organizationId) : []
  if (adminEmails.length === 0) {
    console.warn(`cascade: list exhausted for position ${input.positionId}, but organization ${organizationId} has no admin email`)
    return { outcome: 'exhausted', notified: false }
  }

  try {
    const message = await exhaustedEmail(service, input, context, adminEmails)
    const result = await sendCascadeExhaustedEmail(message)
    await logEmail({
      organizationId: organizationId!,
      recipientEmail: adminEmails[0],
      subject: result?.subject || `Nobody left for ${message.instrument} - ${message.projectName}`,
      emailType: 'cascade_exhausted',
      musicianId: context.trigger.musician_id,
      projectId: project?.id,
      offerId: input.triggerOfferId,
      resendEmailId: result?.id || null,
      status: result?.suppressed ? 'suppressed' : 'sent',
      metadata: { allRecipients: adminEmails, positionId: input.positionId, trigger: input.trigger },
      body: result?.emailHtml,
    })
    return { outcome: 'exhausted', notified: true }
  } catch (err) {
    console.error(`cascade: "nobody left" email for position ${input.positionId} (offer ${input.triggerOfferId}) failed:`, err)
    return { outcome: 'exhausted', notified: false }
  }
}

async function exhaustedEmail(
  service: SupabaseClient,
  input: AdvanceInput,
  context: CascadeContext,
  adminEmails: string[]
): Promise<Parameters<typeof sendCascadeExhaustedEmail>[0]> {
  const { project, organization, instrument, position, services, trigger } = context
  const firstStart = [...services]
    .map((s) => s.start_time)
    .filter(Boolean)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]
  const timezone = organization?.timezone || DEFAULT_TIMEZONE
  return {
    to: adminEmails,
    organizationName: organization?.name || 'Your Organization',
    projectName: project?.name || 'Project',
    instrument: instrument?.name || 'Instrument',
    chairNumber: position?.chair_number || 1,
    totalChairs: await countChairs(service, project?.id, instrument?.id),
    lastMusicianName: `${trigger.musician?.first_name ?? ''} ${trigger.musician?.last_name ?? ''}`.trim() || 'The last musician',
    lastOutcome: input.trigger,
    dashboardUrl: `${getAppUrl()}/dashboard/projects?expand=${project?.id}`,
    performanceDate: firstStart ? formatPerformanceDateForSubject(firstStart, timezone) : '',
  }
}
