import { describe, it, expect } from 'vitest'
import { staffingAlertThreshold } from '@/lib/projects/staffing-alerts'

/**
 * Staffing alerts go out 14, 7 and 3 days before a gig that still has open
 * chairs, once each. The threshold used to be the FIRST list entry the gig fell
 * inside, which is always 14, so after the 14-day email the 7- and 3-day ones
 * were deduplicated away and never sent (audit A, R7).
 */
describe('staffingAlertThreshold', () => {
  it.each([
    [14, 14],
    [10, 14],
    [8, 14],
    [7, 7],
    [5, 7],
    [4, 7],
    [3, 3],
    [1, 3],
    [0, 3],
  ])('%i days out is the %i-day alert', (daysAway, expected) => {
    expect(staffingAlertThreshold(daysAway)).toBe(expected)
  })

  it.each([15, 30, -1])('%i days out is outside every window', (daysAway) => {
    expect(staffingAlertThreshold(daysAway)).toBeNull()
  })
})
