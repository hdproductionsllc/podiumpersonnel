/** Alert thresholds in days before the first upcoming service. One email per project per threshold. */
export const STAFFING_ALERT_THRESHOLDS = [14, 7, 3] as const

/**
 * Which staffing alert a project `daysAway` from its gig is due, or null when
 * it is outside every window.
 *
 * The tightest window that still contains the gig wins: 10 days out is the
 * 14-day alert, 5 days out the 7-day alert, 2 days out the 3-day alert. Taking
 * the first match from the list instead always answered 14, so once the 14-day
 * alert had been sent the 7- and 3-day alerts were deduplicated away and never
 * went out.
 */
export function staffingAlertThreshold(daysAway: number): number | null {
  if (daysAway < 0) return null
  const containing = STAFFING_ALERT_THRESHOLDS.filter((t) => daysAway <= t)
  return containing.length > 0 ? Math.min(...containing) : null
}
