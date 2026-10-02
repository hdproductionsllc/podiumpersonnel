import { createServiceClient } from '@/lib/supabase/server'

/**
 * The staffing history: one staffing_events row per state change of an offer,
 * a chair or a substitution request (migration 092).
 *
 * Before this, status was overwritten in place and nothing recorded who did
 * what, so "why did Mike get this job?" had no answer for a direct assignment
 * and only a partial one for an offer (audit C section 8).
 *
 * logEvent() is bookkeeping, never part of the action it records:
 *   - it never throws, whatever goes wrong (table missing because migration
 *     092 has not been pasted yet, network error, bad input);
 *   - it gives up after LOG_TIMEOUT_MS so a slow database cannot hold the
 *     musician's or admin's request open;
 *   - failures go to console.error, which Vercel's logs keep.
 * Call it AFTER the transition has committed, with what actually changed.
 *
 * It writes with the service role whatever client the caller holds: the table
 * has no INSERT policy, so an admin's own session could not write it, and that
 * is deliberate — history is written by the server, never by a browser.
 */

export type ActorType = 'admin' | 'musician' | 'system'

export type EntityType = 'offer' | 'position' | 'substitution_request'

export type StaffingAction =
  // offers
  | 'offer.sent' // an offer went out (send-email, or a substitute's offer on approval)
  | 'offer.viewed' // the musician opened the gig page for the first time
  | 'offer.accepted' // musician accepted, or admin assigned the musician holding it
  | 'offer.accept_reverted' // accepted, but the chair had already gone to someone else
  | 'offer.declined'
  | 'offer.expired' // the expire cron collected a lapsed offer
  | 'offer.superseded' // retired because another offer or an assignment replaced it
  | 'offer.rescinded' // the admin withdrew it
  | 'offer.released' // an accepted musician let go (substitute took over, or unassigned)
  // chairs
  | 'position.assigned' // seated without an offer being accepted (direct assign, book)
  | 'position.unassigned'
  // substitution requests
  | 'substitution.requested'
  | 'substitution.approved'
  | 'substitution.declined' // the admin said no
  | 'substitution.filled' // the substitute accepted
  | 'substitution.ended' // the substitute declined, let the offer expire, or it was withdrawn

export interface Actor {
  type: ActorType
  /** auth user id for an admin, musicians.id for a musician, omitted for the system. */
  id?: string | null
}

export interface StaffingEvent {
  organizationId: string | null | undefined
  actor: Actor
  entityType: EntityType
  entityId: string | null | undefined
  action: StaffingAction
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}

/** Long enough for a healthy insert, short enough that nobody waits on history. */
export const LOG_TIMEOUT_MS = 3000

export const SYSTEM: Actor = { type: 'system', id: null }

export const adminActor = (userId: string | null | undefined): Actor => ({ type: 'admin', id: userId ?? null })

export const musicianActor = (musicianId: string | null | undefined): Actor => ({
  type: 'musician',
  id: musicianId ?? null,
})

/**
 * Record one or more transitions. Several events from one action go in a
 * single insert. Resolves when the write finished, failed or timed out —
 * never rejects.
 */
export async function logEvent(events: StaffingEvent | StaffingEvent[]): Promise<void> {
  try {
    const list = Array.isArray(events) ? events : [events]
    const rows = []
    for (const e of list) {
      if (!e.organizationId || !e.entityId) {
        console.error(`staffing event ${e.action} skipped: missing organization or entity id`)
        continue
      }
      rows.push({
        organization_id: e.organizationId,
        actor_type: e.actor.type,
        actor_id: e.actor.id ?? null,
        entity_type: e.entityType,
        entity_id: e.entityId,
        action: e.action,
        before: e.before ?? null,
        after: e.after ?? null,
      })
    }
    if (rows.length === 0) return

    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), LOG_TIMEOUT_MS)
    })
    // A rejection is folded into the result: if it lands after the timeout has
    // already won the race, nothing would be left to catch it.
    const write: Promise<{ error: unknown }> = Promise.resolve(
      createServiceClient().from('staffing_events').insert(rows)
    ).then(
      (result) => ({ error: result.error }),
      (error: unknown) => ({ error })
    )

    const outcome = await Promise.race([write, timedOut]).finally(() => clearTimeout(timer))

    if (outcome === 'timeout') {
      console.error(`staffing events not recorded within ${LOG_TIMEOUT_MS}ms: ${describe(rows)}`)
    } else if (outcome.error) {
      console.error(`staffing events not recorded (${describe(rows)}):`, outcome.error)
    }
  } catch (err) {
    console.error('staffing events not recorded:', err)
  }
}

function describe(rows: { action: string; entity_id: string }[]): string {
  return rows.map((r) => `${r.action} ${r.entity_id}`).join(', ')
}
