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
 * QUIET HOURS (David, 2026-10-02): no reminder is sent between 9pm and 8am in
 * the organization's time zone. When the moment above falls inside quiet
 * hours it moves to whichever is nearer: the last evening run (8pm) or 8am the
 * next morning, but never to before the offer was sent or to after its
 * deadline. If neither fits (an offer sent late at night that ends before
 * morning) it gets no reminder: the musician received the offer itself only
 * hours before.
 *
 * Pure: no I/O.
 */

export const REMINDER_LEAD_HOURS = 12

/** Reminders go out only from QUIET_END_HOUR:00 to before QUIET_START_HOUR:00, local time. */
export const QUIET_START_HOUR = 21
export const QUIET_END_HOUR = 8

const HOUR_MS = 60 * 60 * 1000

export interface ReminderCandidate {
  status: string | null | undefined
  sent_at?: string | null
  expires_at: string | null
  reminder_sent_at?: string | null
}

/**
 * The latest deadline a run at `now` can remind: the cron's query bound. Twice
 * the lead, because quiet hours can move a reminder up to 13 hours earlier (to
 * the evening before); isDueForReminder decides exactly.
 */
export function reminderHorizon(now: Date): Date {
  return new Date(now.getTime() + 2 * REMINDER_LEAD_HOURS * HOUR_MS)
}

/** Wall-clock parts of `instant` in `timeZone`. */
function localParts(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  }).formatToParts(new Date(instant))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') }
}

/** The instant at which the wall clock in `timeZone` reads year-month-day hour:00. */
function zonedInstant(year: number, month: number, day: number, hour: number, timeZone: string): number {
  let guess = Date.UTC(year, month - 1, day, hour)
  for (let i = 0; i < 2; i++) {
    const p = localParts(guess, timeZone)
    const shownAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
    guess += Date.UTC(year, month - 1, day, hour) - shownAsUtc
  }
  return guess
}

/** True when `instant` is inside quiet hours in `timeZone`. */
function isQuiet(instant: number, timeZone: string): boolean {
  const { hour } = localParts(instant, timeZone)
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR
}

/**
 * When this offer's reminder becomes due, or null for no reminder: the normal
 * moment (12 hours before the deadline, not before halfway), moved out of
 * quiet hours as the header describes.
 */
export function reminderDueAt(offer: ReminderCandidate, timeZone: string): number | null {
  if (!offer.expires_at) return null
  const expires = new Date(offer.expires_at).getTime()
  const sentMs = offer.sent_at ? new Date(offer.sent_at).getTime() : NaN
  const sent = Number.isFinite(sentMs) && sentMs < expires ? sentMs : null

  let due = expires - REMINDER_LEAD_HOURS * HOUR_MS
  if (sent !== null) due = Math.max(due, sent + (expires - sent) / 2)
  if (!isQuiet(due, timeZone)) return due

  // The quiet stretch `due` falls in: from 9pm that evening to 8am next morning.
  const local = localParts(due, timeZone)
  const eveningDay = local.hour >= QUIET_START_HOUR
    ? new Date(Date.UTC(local.year, local.month - 1, local.day))
    : new Date(Date.UTC(local.year, local.month - 1, local.day - 1))
  const morningDay = new Date(eveningDay.getTime() + 24 * HOUR_MS)
  // The hourly run before 9pm is the last daytime one, so "evening" is 8pm.
  const evening = zonedInstant(eveningDay.getUTCFullYear(), eveningDay.getUTCMonth() + 1, eveningDay.getUTCDate(), QUIET_START_HOUR - 1, timeZone)
  const morning = zonedInstant(morningDay.getUTCFullYear(), morningDay.getUTCMonth() + 1, morningDay.getUTCDate(), QUIET_END_HOUR, timeZone)

  const eveningFits = sent === null || evening >= sent - HOUR_MS
  const morningFits = morning < expires
  if (eveningFits && morningFits) return due - evening <= morning - due ? evening : morning
  if (eveningFits) return evening
  if (morningFits) return morning
  return null
}

/**
 * True when this offer should get its reminder in a run at `now`.
 * `timeZone` is the organization's (IANA name); quiet hours are local to it.
 */
export function isDueForReminder(offer: ReminderCandidate, now: Date, timeZone: string): boolean {
  if (offer.status !== 'pending' && offer.status !== 'viewed') return false
  if (offer.reminder_sent_at) return false
  if (!offer.expires_at) return false

  const at = now.getTime()
  const expires = new Date(offer.expires_at).getTime()
  if (!(expires > at)) return false // lapsed: the expire cron's, not a reminder
  if (isQuiet(at, timeZone)) return false

  const due = reminderDueAt(offer, timeZone)
  return due !== null && at >= due
}
