import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * One reminder per person per send, however many times the button is pressed.
 *
 * On 2026-10-01 a "send reminder" request for a trio's gig details arrived
 * twice, four seconds apart, and all three musicians got the reminder twice.
 * The button greys out while it works, but nothing on the server stopped a
 * second request (a double tap that lands before the page re-renders, a
 * retried connection). Each reminder is now claimed first, in one conditional
 * write: stamp last_reminded_at, but only if this confirmation was not
 * reminded in the last REMINDER_REPEAT_WINDOW. Of two requests at once,
 * exactly one wins each person; the other skips them.
 *
 * Migration 102 adds the column. Until it is applied the claim cannot be made,
 * and the reminder goes out as it always did ('unguarded').
 */
export const REMINDER_REPEAT_WINDOW_MS = 10 * 60 * 1000

export type ReminderClaim = 'claimed' | 'recently_reminded' | 'unguarded'

export async function claimReminder(
  service: SupabaseClient,
  table: 'gig_detail_confirmations' | 'music_confirmations',
  confirmationId: string,
  now: Date = new Date()
): Promise<ReminderClaim> {
  const cutoff = new Date(now.getTime() - REMINDER_REPEAT_WINDOW_MS).toISOString()
  const { data, error } = await service
    .from(table)
    .update({ last_reminded_at: now.toISOString() })
    .eq('id', confirmationId)
    .or(`last_reminded_at.is.null,last_reminded_at.lt.${cutoff}`)
    .select('id')

  if (error) {
    // 42703 / PGRST204: the column is not there yet (migration 102 not applied).
    const code = (error as { code?: string }).code
    if (code === '42703' || code === 'PGRST204') return 'unguarded'
    console.error(`claimReminder: could not claim the reminder for ${table} ${confirmationId}; sending anyway:`, error)
    return 'unguarded'
  }
  return data && data.length > 0 ? 'claimed' : 'recently_reminded'
}
