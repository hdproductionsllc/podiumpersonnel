/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST embeds */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getNextCandidates, type Candidate } from './candidates'
import { cascadeExpiresAt } from './expiry'
import { LIVE_OFFER_STATUSES } from './live'
import { isMissingColumn } from './rpc'
import { servicesFor, withScope, type ScopeSelect } from './scope'
import { getOrgStaffingSettings } from './settings'
import { OFFER_EMAIL_ORG_FIELDS, OFFER_EMAIL_SERVICE_FIELDS } from './offer-email-fields'

/**
 * What the auto-cascade WOULD do for one ended offer: read-only.
 *
 * planCascade only reads (selects, never an insert, update or database
 * function), so the same code answers two questions:
 *
 *   - cascade.ts advance(): "what should I do now?", before it acts through
 *     the cascade_offer / mark_cascade_exhausted database functions (096),
 *     which re-check every reason to stop under the chair's lock;
 *   - scripts/preview-auto-cascade.js: "what would happen if David switched
 *     auto-offer on?", against production with GET requests only.
 *
 * The reasons to stop are checked in the order cascade_refusal (096) checks
 * them, so the preview and the database agree on why.
 */

/** Why the cascade does nothing. The database functions return the same words. */
export type CascadeSkipReason =
  | 'auto_off' // the organization has auto-offer off (or 096 is not applied)
  | 'not_ready' // 096's columns or functions are missing
  | 'not_found' // the offer or its chair is gone
  | 'chair_opted_out' // "don't auto-offer this chair"
  | 'gig_closed' // cancelled or completed
  | 'gig_not_active' // a draft
  | 'trigger_not_ended' // the offer is not declined, expired or released
  | 'already_cascaded' // this offer already caused an automatic offer
  | 'already_exhausted' // this offer already ran the list out (admins were told)
  | 'chair_filled' // someone holds the chair
  | 'chair_has_live_offer' // someone is already being asked
  | 'no_time_left' // the gig's first service starts within CASCADE_MIN_LEAD_MS, or has started
  | 'error' // something failed; logged

/** Ended statuses that can start a cascade: declined, expired, dropped ('released'). */
export const CASCADE_TRIGGER_STATUSES = ['declined', 'expired', 'released'] as const

/** The ended offer, as the cascade reads it. */
export interface TriggerOffer {
  id: string
  status: string
  project_position_id: string
  musician_id: string
  sent_at: string | null
  expires_at: string | null
  custom_pay: number | string | null
  terms_snapshot: Record<string, any> | null
  cascade_exhausted_at: string | null
  musician?: { id?: string; first_name?: string | null; last_name?: string | null } | null
}

/** What the next offer, and every email about it, needs. */
export interface CascadeContext {
  trigger: TriggerOffer
  position: any
  project: any
  organization: any
  instrument: any
  services: any[]
}

/** The terms the next offer copies from the ended one (owner decision). */
export interface CascadeTerms {
  /** The whole-gig fee, or null to leave each service on its own rate. */
  customPay: number | null
  /** The leader-fee choice recorded on the ended offer; null = the email's default rule. */
  includeLeaderFee: boolean | null
  leaderFeeAmount: number | null
  /** The same response window, starting now, never past the gig's first service start. */
  expiresAt: string
}

export type CascadePlan =
  | { kind: 'skip'; reason: CascadeSkipReason; organizationId?: string; context?: CascadeContext }
  | {
      kind: 'exhausted'
      context: CascadeContext
      skippedConflicts: number
      /** Free, but no email address on file, so they cannot be offered it. */
      unreachable: Candidate[]
    }
  | { kind: 'offer'; context: CascadeContext; musician: Candidate; terms: CascadeTerms; skippedConflicts: number }

export interface PlanInput {
  positionId: string
  triggerOfferId: string
  /** For tests and the preview; defaults to the clock. */
  now?: number
  /**
   * Preview only (scripts/preview-auto-cascade.js): plan as if the
   * organization had auto-offer on, and as if this still-open offer had just
   * been declined or had lapsed. advance() never sets these.
   */
  assume?: { autoCascadeOn?: boolean; triggerEnded?: boolean }
  /**
   * Musicians cascade_offer has already refused during this advance() (taken
   * by another chair or gig in the meantime, deactivated). Left out, so the
   * next attempt moves down the list instead of choosing them again.
   */
  excludeMusicianIds?: readonly string[]
}

/** The chair as the cascade reads it; `scope` from withScope (scope.ts). */
const positionSelect = (scope: ScopeSelect) => `
  id,
  chair_number${scope},
  musician_id,
  status,
  instrument_id,
  project_id,
  auto_cascade_disabled,
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
` as const

const TRIGGER_SELECT = `
  id,
  status,
  project_position_id,
  musician_id,
  sent_at,
  expires_at,
  custom_pay,
  terms_snapshot,
  cascade_exhausted_at,
  musician:musicians(id, first_name, last_name)
`

/**
 * A read failed after the chair's organization was known. Carries it, so the
 * caller can still record the failure in that organization's history.
 */
export class CascadePlanError extends Error {
  constructor(
    readonly cause: unknown,
    readonly organizationId: string
  ) {
    super(cause instanceof Error ? cause.message : String((cause as { message?: string })?.message ?? cause))
    this.name = 'CascadePlanError'
  }
}

export async function planCascade(service: SupabaseClient, input: PlanInput): Promise<CascadePlan> {
  const now = input.now ?? Date.now()

  // -- the chair, its gig and the organization's switch ----------------------------

  const { data: position, error: positionError } = await withScope((scope) => service
    .from('project_positions')
    .select(positionSelect(scope))
    .eq('id', input.positionId)
    .maybeSingle())

  if (positionError) {
    if (isMissingColumn(positionError)) return { kind: 'skip', reason: 'not_ready' }
    throw positionError
  }
  if (!position) return { kind: 'skip', reason: 'not_found' }

  const pos = position as any
  const project = pos.project
  // The services this chair works (the whole gig unless limited): the
  // cascaded offer's deadline, snapshot and email are about those.
  const services: any[] = servicesFor(pos, project?.services || [])

  const settings = project?.organization_id ? await getOrgStaffingSettings(service, project.organization_id) : null
  if (!settings?.autoCascade && !input.assume?.autoCascadeOn) return { kind: 'skip', reason: 'auto_off' }

  const organizationId: string = project.organization_id
  const partial = { position: pos, project, organization: project?.organization, instrument: pos.instrument, services }

  if (pos.auto_cascade_disabled === true) return { kind: 'skip', reason: 'chair_opted_out', organizationId }
  if (project?.status === 'cancelled' || project?.status === 'completed') return { kind: 'skip', reason: 'gig_closed', organizationId }
  if (project?.status !== 'active') return { kind: 'skip', reason: 'gig_not_active', organizationId }

  try {
    return await planEndedOffer(service, input, now, partial, organizationId)
  } catch (err) {
    throw new CascadePlanError(err, organizationId)
  }
}

async function planEndedOffer(
  service: SupabaseClient,
  input: PlanInput,
  now: number,
  partial: Omit<CascadeContext, 'trigger'>,
  organizationId: string
): Promise<CascadePlan> {
  const pos = partial.position
  const services = partial.services

  // -- the ended offer ----------------------------------------------------------------

  const { data: triggerRow, error: triggerError } = await service
    .from('contract_offers')
    .select(TRIGGER_SELECT)
    .eq('id', input.triggerOfferId)
    .maybeSingle()

  if (triggerError) {
    if (isMissingColumn(triggerError)) return { kind: 'skip', reason: 'not_ready', organizationId }
    throw triggerError
  }
  const trigger = triggerRow as TriggerOffer | null
  if (!trigger || trigger.project_position_id !== pos.id) return { kind: 'skip', reason: 'not_found', organizationId }

  const context: CascadeContext = { trigger, ...partial }
  const skip = (reason: CascadeSkipReason): CascadePlan => ({ kind: 'skip', reason, organizationId, context })

  const ended = (CASCADE_TRIGGER_STATUSES as readonly string[]).includes(trigger.status)
  if (!ended && !input.assume?.triggerEnded) return skip('trigger_not_ended')

  const { data: cascaded, error: cascadedError } = await service
    .from('contract_offers')
    .select('id')
    .eq('cascaded_from_offer_id', trigger.id)
    .limit(1)
  if (cascadedError) {
    if (isMissingColumn(cascadedError)) return skip('not_ready')
    throw cascadedError
  }
  if (cascaded && cascaded.length > 0) return skip('already_cascaded')
  if (trigger.cascade_exhausted_at) return skip('already_exhausted')

  if (pos.musician_id) return skip('chair_filled')

  const { data: live, error: liveError } = await service
    .from('contract_offers')
    .select('id')
    .eq('project_position_id', pos.id)
    .neq('id', trigger.id)
    .in('status', [...LIVE_OFFER_STATUSES])
    .limit(1)
  if (liveError) throw liveError
  if (live && live.length > 0) return skip('chair_has_live_offer')

  const expiresAt = cascadeExpiresAt(trigger, services.map((s) => s.start_time), now)
  if (!expiresAt) return skip('no_time_left')

  // -- who is next ----------------------------------------------------------------------

  // Strict: a failed read throws (advance() turns that into skipped('error'))
  // rather than reading as "nobody left" or "no conflicts".
  const { candidates } = await getNextCandidates(service, pos.id, undefined, { forCascade: true })
  const { next, skippedConflicts, unreachable } = rankForCascade(candidates, input.excludeMusicianIds)
  if (!next) return { kind: 'exhausted', context, skippedConflicts, unreachable }

  return {
    kind: 'offer',
    context,
    musician: next,
    terms: { ...cascadeTerms(trigger), expiresAt },
    skippedConflicts,
  }
}

/**
 * The next person to ask: the first by call order who is free (no conflict)
 * and can be reached (has an email address; an offer nobody hears about would
 * hold the chair for nothing). getNextCandidates has already left out anyone
 * on the gig, offered elsewhere on it, or who had their turn at this chair.
 *
 * Call order only. musicians.is_leader says someone CAN lead; it never decides
 * who is offered a chair (owner decision), so the list getNextCandidates
 * returns (leaders first on chair 1, for the admin's suggestions) is re-sorted
 * here, with ties broken by name and id so the choice never depends on it.
 *
 * `exclude`: musicians the database refused earlier in the same advance().
 * `unreachable`: free musicians passed over for having no email address, so the
 * "nobody left" email can name them.
 */
export function rankForCascade(
  candidates: readonly Candidate[],
  exclude: readonly string[] = []
): { next: Candidate | null; skippedConflicts: number; unreachable: Candidate[] } {
  const considered = candidates.filter((c) => !exclude.includes(c.id))
  const free = considered.filter((c) => !c.has_conflict)
  const reachable = free.filter((c) => !!c.email)
  const order = (c: Candidate) => (c.call_order == null ? Number.POSITIVE_INFINITY : c.call_order)
  const ranked = [...reachable].sort(
    (a, b) =>
      order(a) - order(b) ||
      (a.last_name || '').localeCompare(b.last_name || '') ||
      (a.first_name || '').localeCompare(b.first_name || '') ||
      a.id.localeCompare(b.id)
  )
  return {
    next: ranked[0] ?? null,
    skippedConflicts: considered.length - free.length,
    unreachable: free.filter((c) => !c.email),
  }
}

/**
 * The ended offer's pay terms: the same whole-gig fee, and the leader-fee
 * choice recorded on it (terms_snapshot.pay, migration 093). An offer with no
 * recorded choice gets none, so the offer email applies its usual default, as
 * it did for the ended offer.
 */
export function cascadeTerms(trigger: Pick<TriggerOffer, 'custom_pay' | 'terms_snapshot'>): Omit<CascadeTerms, 'expiresAt'> {
  const pay = trigger.terms_snapshot?.pay
  const includeLeaderFee = typeof pay?.include_leader_fee === 'boolean' ? pay.include_leader_fee : null
  const leaderFeeAmount = includeLeaderFee && pay?.leader_fee_amount != null ? Number(pay.leader_fee_amount) : null
  return {
    customPay: trigger.custom_pay != null ? Number(trigger.custom_pay) : null,
    includeLeaderFee,
    leaderFeeAmount,
  }
}
