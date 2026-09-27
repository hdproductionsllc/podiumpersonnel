/**
 * When an active project may be marked completed (which moves it into the
 * Projects page's archive).
 *
 * The morning after a gig is when the owner opens Projects to see who needs
 * paying, so a project stays active for ONE full day after its end_date, in the
 * organization's own time zone, and is completed from the day after that:
 *
 *   gig on Saturday -> active all Saturday and Sunday -> completed on Monday
 *
 * This used to compare end_date with today in UTC, which completed an evening
 * gig in Chicago or Los Angeles before the owner's next day had even begun.
 *
 * Two places complete projects and both must use this rule: the daily
 * complete-projects cron and the Projects page load (its safety net for when
 * the cron has not run yet).
 */

import { DEFAULT_TIMEZONE } from '@/lib/utils'

/** YYYY-MM-DD for `now` as a wall-calendar date in `timeZone`. */
export function localDate(now: Date, timeZone: string): string {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
  } catch {
    // An unknown zone string must not stop the archive; fall back to the default.
    return localDate(now, DEFAULT_TIMEZONE)
  }
}

/** A YYYY-MM-DD date moved by whole days, with no time-zone drift. */
export function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Projects whose end_date is BEFORE this date may be completed. It is
 * yesterday in the org's time zone, so the day after the gig stays active.
 */
export function completionCutoff(now: Date, timeZone: string | null | undefined): string {
  return shiftDate(localDate(now, timeZone || DEFAULT_TIMEZONE), -1)
}

/** True when an active project with this end_date should now be completed. */
export function isReadyToComplete(
  endDate: string | null | undefined,
  now: Date,
  timeZone: string | null | undefined,
): boolean {
  return !!endDate && endDate < completionCutoff(now, timeZone)
}
