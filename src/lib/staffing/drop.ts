/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST embeds */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrgAdminEmails } from '@/lib/supabase/server'
import { formatPerformanceDateForSubject, sendAdminWorkerDroppedEmail } from '@/lib/email/send'
import { notify } from '@/lib/notify'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'
import { advance, autoOfferNote, type AdvanceResult } from './cascade'
import { countChairs, isOfferClosed } from './respond'
import { isMissingFunction } from './rpc'
import { getOrgStaffingSettings } from './settings'
import { servicesFor, withScope, type ScopeSelect } from './scope'

/**
 * Worker drop (the plan, Release 1 B1.3): someone who accepted presses "I
 * can't make it" on their gig page and gives the gig back.
 *
 * Only where the organization allows it (organizations.allow_worker_drop,
 * migration 096: off for the music verticals, which keep the substitute
 * request, on for the others), only for an accepted offer, and only before the
 * gig's first service starts.
 *
 * The change itself is the database function worker_drop (096): in one
 * transaction the offer becomes 'released', the chair goes back to vacant, and
 * offer.released is recorded with reason 'dropped'. Doing that in one
 * transaction (rather than an offer update followed by releaseSeat) means a
 * failure can never leave a released worker still sitting in the chair. It
 * also makes a second press of the button harmless: it gets 'already_released'
 * and nothing is sent twice.
 *
 * After it, and only after it succeeded:
 *   1. the auto-cascade, trigger 'dropped' (cascade.ts advance(); it does
 *      nothing unless the organization has auto-offer on), then
 *   2. one email to the admins (admin-worker-dropped), saying what auto-offer
 *      did when it did something, logged to email_logs.
 *
 * The worker sees the result on the gig page; they are not emailed.
 */

/** No drop once the gig's first service has started. */
export function gigHasStarted(serviceStarts: readonly (string | null | undefined)[], now: number = Date.now()): boolean {
  return serviceStarts.some((s) => !!s && new Date(s).getTime() <= now)
}

/** The longest note a worker can leave; the database keeps the same. */
export const DROP_REASON_MAX = 1000

export function cleanDropReason(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().slice(0, DROP_REASON_MAX)
  return trimmed || null
}

export type DropOutcome =
  /** Done: the offer is released, the chair is open, the admins were told. */
  | 'released'
  /** A second press: it was already done; nothing more happened. */
  | 'already_released'
  | 'not_found'
  /** Never accepted, or ended some other way. */
  | 'not_accepted'
  /** The organization has worker drop off (all music organizations by default). */
  | 'not_allowed'
  /** The gig is cancelled or completed, or the worker was deactivated. */
  | 'closed'
  | 'gig_started'
  /** The chair is held by someone else (only reachable through bad data). */
  | 'not_seated'
  /** They asked for a substitute who is not settled yet. */
  | 'substitution_in_progress'
  /** Migration 096 is not applied. */
  | 'not_ready'

export interface DropResult {
  outcome: DropOutcome
  /** What the auto-cascade did, when the drop happened. */
  cascade?: AdvanceResult
}

/** `scope` from withScope (scope.ts): which of the gig's services the chair works. */
const offerSelect = (scope: ScopeSelect) => `
  id,
  status,
  project_position_id,
  musician_id,
  musician:musicians(id, first_name, last_name, email, is_active),
  project_position:project_positions(
    id,
    chair_number${scope},
    instrument:instruments(id, name),
    project:projects(
      id,
      name,
      status,
      organization_id,
      organization:organizations(id, name, timezone),
      services(id, start_time)
    )
  )
` as const

/** worker_drop's answers that are not 'released'. */
const REFUSALS: readonly DropOutcome[] = [
  'already_released',
  'not_found',
  'not_accepted',
  'not_allowed',
  'gig_started',
  'not_seated',
  'substitution_in_progress',
]

export async function dropFromGig(service: SupabaseClient, token: string, rawReason: unknown): Promise<DropResult> {
  const reason = cleanDropReason(rawReason)

  const { data: offer, error: fetchError } = await withScope((scope) =>
    service.from('contract_offers').select(offerSelect(scope)).eq('token', token).maybeSingle()
  )
  if (fetchError) throw fetchError
  if (!offer) return { outcome: 'not_found' }

  const row = offer as any
  const musician = row.musician
  const position = row.project_position
  const project = position?.project
  // The services this chair works (the whole gig unless it is limited to some):
  // "has it started" is about the chair's first one, as worker_drop (098) asks.
  const services: { id: string; start_time: string | null }[] = servicesFor(position, project?.services || [])

  // The same checks worker_drop makes under the chair's lock; made here first
  // so a refused press costs no write.
  if (row.status === 'released') return { outcome: 'already_released' }
  if (row.status !== 'accepted') return { outcome: 'not_accepted' }
  if (isOfferClosed(project, musician)) return { outcome: 'closed' }

  const settings = project?.organization_id ? await getOrgStaffingSettings(service, project.organization_id) : null
  if (!settings?.allowWorkerDrop) return { outcome: 'not_allowed' }
  if (gigHasStarted(services.map((s) => s.start_time))) return { outcome: 'gig_started' }

  const { data: result, error: dropError } = await service.rpc('worker_drop', { p_offer_id: row.id, p_reason: reason })
  if (dropError) {
    if (isMissingFunction(dropError, 'worker_drop')) {
      console.error(`worker drop: offer ${row.id}: migration 096 (scripts/sql/096-auto-cascade-settings.paste.sql) has not been applied`)
      return { outcome: 'not_ready' }
    }
    throw dropError
  }
  if (result !== 'released') {
    if (result === 'project_inactive') return { outcome: 'closed' }
    if ((REFUSALS as readonly string[]).includes(result)) return { outcome: result as DropOutcome }
    throw new Error(`worker_drop returned an unexpected answer: ${String(result)}`)
  }

  // The drop is committed. Nothing below may turn it into an error for the worker.
  const cascade = await advance(service, { positionId: row.project_position_id, triggerOfferId: row.id, trigger: 'dropped' })

  try {
    await notifyAdmins(service, { offerId: row.id, musician, position, project, services, reason, cascade })
  } catch (err) {
    console.error(`worker drop: offer ${row.id}: the admins' email failed; the drop stands:`, err)
  }

  return { outcome: 'released', cascade }
}

async function notifyAdmins(
  service: SupabaseClient,
  ctx: { offerId: string; musician: any; position: any; project: any; services: { start_time: string | null }[]; reason: string | null; cascade: AdvanceResult }
) {
  const { musician, position, project, services, reason } = ctx
  const organizationId: string | undefined = project?.organization_id
  if (!organizationId) return

  const adminEmails = await getOrgAdminEmails(organizationId)
  if (adminEmails.length === 0) {
    console.warn(`worker drop: offer ${ctx.offerId}: organization ${organizationId} has no admin email`)
    return
  }

  const organization = project?.organization
  const instrument = position?.instrument
  const timezone = organization?.timezone || DEFAULT_TIMEZONE
  const firstStart = services
    .map((s) => s.start_time)
    .filter((s): s is string => !!s)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]
  const musicianName = `${musician?.first_name ?? ''} ${musician?.last_name ?? ''}`.trim() || 'A worker'
  const autoOffer = autoOfferNote(ctx.cascade, timezone)
  const totalChairs = await countChairs(service, project?.id, instrument?.id)

  await notify(
    {
      type: 'worker_dropped',
      record: (r) => ({
        organizationId,
        recipientEmail: adminEmails[0],
        subject: r?.subject || `${musicianName} can't make it - ${project?.name || 'Project'}`,
        emailType: 'worker_dropped',
        musicianId: musician?.id,
        projectId: project?.id,
        offerId: ctx.offerId,
        resendEmailId: r?.id || null,
        status: r?.suppressed ? 'suppressed' : 'sent',
        metadata: {
          allRecipients: adminEmails,
          positionId: position?.id,
          reason,
          cascade: ctx.cascade.outcome,
        },
        body: r?.emailHtml,
      }),
    },
    {
      email: () =>
        sendAdminWorkerDroppedEmail({
          to: adminEmails,
          organizationName: organization?.name || 'Your Organization',
          organizationId,
          projectName: project?.name || 'Project',
          musicianName,
          musicianEmail: musician?.email || null,
          instrument: instrument?.name || 'Instrument',
          chairNumber: position?.chair_number || 1,
          totalChairs,
          reason,
          dashboardUrl: `${getAppUrl()}/dashboard/projects?expand=${project?.id}`,
          performanceDate: firstStart ? formatPerformanceDateForSubject(firstStart, timezone) : '',
          ...(autoOffer ? { autoOffer } : {}),
        }),
    }
  )
}
