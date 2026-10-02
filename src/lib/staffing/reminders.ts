/**
 * When an unanswered offer gets its one "please respond" reminder.
 *
 * The offer-reminders cron used to run once a day (12:23 UTC) and remind every
 * open offer expiring within the next 24 hours. The 24-hour window existed only
 * because the run was daily: it was the narrowest window that still caught
 * every offer once before it ran out. Which offer was reminded how early
 * depended on where its deadline fell against 12:23 — anywhere from a few
 * minutes to 24 hours before it, about 12 hours on average, and an ASAP offer
 * was reminded only if a 12:23 run happened to fall inside its 4 hours.
 *
 * The cron now runs hourly (the plan, B1.2). Kept at 24 hours, the window would
 * remind nearly every offer a full day ahead (earlier than before for most) and
 * a 24-hour offer within an hour of sending it. So the rule is now set by the
 * offer, not by the cron's clock. An offer is due when BOTH:
 *
 *   - its deadline is at most REMINDER_LEAD_HOURS (12) away: the old average;
 *   - at least half of its response window (sent_at to expires_at) has gone:
 *     a short offer is not reminded straight after it was sent. A 4-hour ASAP
 *     offer is reminded with about 2 hours left, a 24-hour one with 12.
 *
 * Still at most one reminder per offer, ever: the cron claims reminder_sent_at
 * before sending, and only offers with it unset are considered. Same
 * recipients, same emails.
 *
 * Pure: no I/O.
 */

export const REMINDER_LEAD_HOURS = 12

const HOUR_MS = 60 * 60 * 1000

export interface ReminderCandidate {
  status: string | null | undefined
  sent_at?: string | null
  expires_at: string | null
  reminder_sent_at?: string | null
}

/** The latest deadline a run at `now` can remind: the cron's query bound. */
export function reminderHorizon(now: Date): Date {
  return new Date(now.getTime() + REMINDER_LEAD_HOURS * HOUR_MS)
}

/** True when this offer should get its reminder in a run at `now`. */
export function isDueForReminder(offer: ReminderCandidate, now: Date): boolean {
  if (offer.status !== 'pending' && offer.status !== 'viewed') return false
  if (offer.reminder_sent_at) return false
  if (!offer.expires_at) return false

  const expires = new Date(offer.expires_at).getTime()
  const at = now.getTime()
  if (!(expires > at)) return false // lapsed: the expire cron's, not a reminder
  if (expires - at > REMINDER_LEAD_HOURS * HOUR_MS) return false

  const sent = offer.sent_at ? new Date(offer.sent_at).getTime() : NaN
  if (Number.isFinite(sent) && sent < expires) {
    const halfway = sent + (expires - sent) / 2
    if (at < halfway) return false
  }
  return true
}
