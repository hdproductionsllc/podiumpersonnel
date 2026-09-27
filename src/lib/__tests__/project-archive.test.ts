import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { completionCutoff, isReadyToComplete, localDate, shiftDate } from '@/lib/projects/archive'

/**
 * A gig stays in the active Projects list for one full day after it ends, in
 * the org's own time zone, because the morning after is when the owner opens
 * Projects to see who needs paying. Gig on Saturday -> completed on Monday.
 */
describe('project archive rule', () => {
  const CHICAGO = 'America/Chicago'
  const LA = 'America/Los_Angeles'
  const SATURDAY = '2026-09-26'

  it('keeps a Saturday gig active all of Sunday, in the org time zone', () => {
    // Sunday 11:30pm in Chicago is already Monday 04:30 UTC. The old UTC rule
    // would have completed it; the owner's Sunday is not over.
    const sundayLateChicago = new Date('2026-09-28T04:30:00Z')
    expect(localDate(sundayLateChicago, CHICAGO)).toBe('2026-09-27')
    expect(isReadyToComplete(SATURDAY, sundayLateChicago, CHICAGO)).toBe(false)
  })

  it('completes it once Monday begins in the org time zone', () => {
    const mondayEarlyChicago = new Date('2026-09-28T05:30:00Z') // 00:30 CDT Monday
    expect(isReadyToComplete(SATURDAY, mondayEarlyChicago, CHICAGO)).toBe(true)
  })

  it('never completes on the night of the gig itself (the old UTC bug)', () => {
    // Saturday 8pm in LA is Sunday 03:00 UTC.
    const saturdayNightLA = new Date('2026-09-27T03:00:00Z')
    expect(isReadyToComplete(SATURDAY, saturdayNightLA, LA)).toBe(false)
  })

  it('the daily cron at 09:37 UTC completes Monday morning for both US zones', () => {
    const mondayCronRun = new Date('2026-09-28T09:37:00Z')
    expect(isReadyToComplete(SATURDAY, mondayCronRun, CHICAGO)).toBe(true)
    expect(isReadyToComplete(SATURDAY, mondayCronRun, LA)).toBe(true)
    const sundayCronRun = new Date('2026-09-27T09:37:00Z')
    expect(isReadyToComplete(SATURDAY, sundayCronRun, CHICAGO)).toBe(false)
    expect(isReadyToComplete(SATURDAY, sundayCronRun, LA)).toBe(false)
  })

  it('treats a missing end date as not ready, and a bad zone as the default zone', () => {
    const now = new Date('2026-10-01T12:00:00Z')
    expect(isReadyToComplete(null, now, CHICAGO)).toBe(false)
    expect(completionCutoff(now, 'Not/AZone')).toBe(completionCutoff(now, null))
  })

  it('shifts dates across month and year ends without drift', () => {
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftDate('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('both enforcement points use the shared rule, not a UTC date', () => {
    for (const file of [
      'src/app/api/cron/complete-projects/route.ts',
      'src/app/dashboard/projects/page.tsx',
    ]) {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      expect(src, file).toContain('isReadyToComplete(')
      expect(src, file).not.toMatch(/\.lt\('end_date', today\)/)
    }
  })
})
