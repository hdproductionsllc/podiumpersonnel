import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Phase 5 reliability audit — duplicate-send guard, cron failure alerts, and the
 * dashboard null-org guard.
 */

const root = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf-8')

describe('offer-reminders is duplicate-safe', () => {
  const src = read('src/app/api/cron/offer-reminders/route.ts')
  it('claims the offer (atomic reminder_sent_at) before sending', () => {
    expect(src).toContain("is('reminder_sent_at', null)")
    expect(src).toContain('claimed')
    // The claim must come with a select so we can detect whether we won it.
    expect(src).toMatch(/claimed\.length === 0/)
  })
  it('alerts ops on a fatal fetch failure', () => {
    // 2026-09-18 (A8): job-level alerting moved into the shared runCronJob
    // wrapper — the route throws the fetch error and the wrapper is what
    // calls notifyOps, exactly once, for every cron job.
    expect(src).toContain("runCronJob('offer-reminders'")
  })
})

describe('cron failure alerting', () => {
  it('notifyOps goes through the gated email path and needs PLATFORM_ADMIN_EMAIL', () => {
    const src = read('src/lib/cron.ts')
    expect(src).toContain('PLATFORM_ADMIN_EMAIL')
    expect(src).toContain('sendEmail')
  })
  it('runCronJob reports a job failure via notifyOps AND serverError', () => {
    const src = read('src/lib/cron.ts')
    expect(src).toContain('export async function runCronJob')
    expect(src).toContain('await notifyOps(jobName, error)')
    expect(src).toContain('serverError(`cron:${jobName}`, error)')
  })
  it('expire-offers alerts ops on a fatal fetch failure', () => {
    const src = read('src/app/api/cron/expire-offers/route.ts')
    expect(src).toContain("runCronJob('expire-offers'")
  })
})

describe('dashboard guards a missing org', () => {
  it('redirects to onboarding instead of asserting a non-null org', () => {
    const src = read('src/app/dashboard/page.tsx')
    expect(src).toContain("redirect('/onboarding')")
    expect(src).not.toContain('organization!.id')
  })
})

describe('clear-all uses a dialog, not a raw confirm()', () => {
  it('no window.confirm in project-positions', () => {
    const src = read('src/components/projects/project-positions.tsx')
    expect(src).not.toMatch(/\bconfirm\(/)
    expect(src).toContain('showClearConfirm')
  })
})
