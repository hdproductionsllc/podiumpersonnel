import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Every Supabase 504 we have ever captured landed in the first minute of an
 * hour — expire-offers at :00:11, pre-gig-reminders at :00:34 — while probes
 * from a laptop at the same seconds got 200s. Vercel releases every customer's
 * cron on the minute boundary, so minute 0 is the busiest moment on the
 * iad1 -> Supabase path and the only moment our jobs used to run.
 *
 * Staggering them off :00 is the cheap half of the fix (withCronRetry is the
 * other half). It only stays fixed if nobody drifts a schedule back to minute
 * 0 later, so pin it here rather than in a comment.
 */
describe('vercel.json cron schedules', () => {
  const config = JSON.parse(
    readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'),
  ) as { crons: { path: string; schedule: string }[] }

  it('defines at least one cron', () => {
    expect(config.crons.length).toBeGreaterThan(0)
  })

  // A job may list several fixed minutes (the after-gig job runs every 15
  // minutes as "4,19,34,49"). Each listed minute is held to the same rules.
  const minutesOf = (schedule: string) => schedule.split(' ')[0].split(',')

  it('never schedules a job on minute 0', () => {
    const offenders = config.crons.filter((c) => minutesOf(c.schedule).includes('0'))
    expect(offenders.map((c) => `${c.path} (${c.schedule})`)).toEqual([])
  })

  it('uses fixed minutes, not a wildcard or a step, so runs stay predictable', () => {
    for (const cron of config.crons) {
      for (const minute of minutesOf(cron.schedule)) {
        expect(minute, `${cron.path} minute field`).toMatch(/^[1-5]?\d$/)
        expect(Number(minute), `${cron.path} minute field`).toBeGreaterThan(0)
      }
    }
  })

  it('spreads the jobs across different minutes so they never pile up together', () => {
    const minutes = config.crons.flatMap((c) => minutesOf(c.schedule))
    expect(new Set(minutes).size).toBe(minutes.length)
  })
})
