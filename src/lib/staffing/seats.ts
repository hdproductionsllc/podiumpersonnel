import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Freeing a chair: the one function that sets a position back to vacant.
 *
 * There used to be four hand-written copies of this update (decline, the expire
 * cron, rescind, unassign) with three different guard policies, and the
 * unguarded copies were how a stale decline could evict whoever held the chair
 * (audit R-2/R-4). The reason is required so the guard is a decision the caller
 * states, not something it remembers to add:
 *
 *   declined / expired / rescinded
 *     An unanswered offer ended. A pending offer never seats anyone, so the
 *     chair is freed only if nobody is in it (musician_id IS NULL). If someone
 *     is, they got the chair another way (accepted a different offer, direct
 *     assignment, book import) and must not be removed.
 *
 *   unassigned
 *     The admin is deliberately taking the chair away from the musician who
 *     holds it. No guard: clearing a held chair is the whole point.
 */
export type SeatReleaseReason = 'declined' | 'expired' | 'rescinded' | 'unassigned'

export interface ReleaseSeatResult {
  /** The chair was written back to vacant. False when the guard found it held. */
  released: boolean
  error: unknown | null
}

export async function releaseSeat(
  supabase: SupabaseClient,
  positionId: string,
  reason: SeatReleaseReason
): Promise<ReleaseSeatResult> {
  let update = supabase
    .from('project_positions')
    .update({ musician_id: null, status: 'vacant' })
    .eq('id', positionId)

  if (reason !== 'unassigned') {
    update = update.is('musician_id', null)
  }

  const { data, error } = await update.select('id')
  if (error) return { released: false, error }
  return { released: !!data && data.length > 0, error: null }
}
