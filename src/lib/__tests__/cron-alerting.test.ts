import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'

/**
 * A8 (2026-09-18 hardening): job-level cron alerting.
 *
 * Before this, each of the 7 cron routes hand-rolled its own
 * `notifyOps(...); return NextResponse.json({ error }, { status: 500 })` at
 * the fatal fetch site, and `notifyOps`'s alert email rendered plain-object
 * Supabase errors as "[object Object]" if `describeError` weren't used.
 *
 * Now every route funnels a fatal failure through ONE wrapper, `runCronJob`,
 * which both alerts ops (Sentry + PLATFORM_ADMIN_EMAIL email) AND reports
 * through the same `serverError()` every other API route uses (Sentry +
 * generic, non-leaky 500 body).
 *
 * `@/lib/cron` re-exports `notifyOps`, which pulls in the Resend client —
 * and that constructor throws on an empty key at module load. Seed a dummy
 * key and import dynamically, matching cron-auth.test.ts / cron-retry.test.ts.
 */

const sentryCaptureException = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => sentryCaptureException(...args),
}))

interface SendEmailArgs {
  to: string
  subject: string
  html: string
}

const sendEmail = vi.fn(async (_args: SendEmailArgs) => ({ id: 'em-alert' }))
vi.mock('@/lib/email/send', () => ({ sendEmail: (args: SendEmailArgs) => sendEmail(args) }))

let cron: typeof import('@/lib/cron')

beforeAll(async () => {
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test_dummy'
  cron = await import('@/lib/cron')
})

const ORIG_ADMIN_EMAIL = process.env.PLATFORM_ADMIN_EMAIL

beforeEach(() => {
  vi.clearAllMocks()
  process.env.PLATFORM_ADMIN_EMAIL = 'ops@example.com'
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  if (ORIG_ADMIN_EMAIL === undefined) delete process.env.PLATFORM_ADMIN_EMAIL
  else process.env.PLATFORM_ADMIN_EMAIL = ORIG_ADMIN_EMAIL
})

describe('runCronJob', () => {
  it('returns the handler result untouched on success, alerting nobody', async () => {
    const { NextResponse } = await import('next/server')
    const ok = NextResponse.json({ completed: 3 })

    const res = await cron.runCronJob('demo-job', async () => ok)

    expect(res).toBe(ok)
    expect(sentryCaptureException).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('catches a thrown fatal error, alerts ops via Sentry + email, and returns a generic 500', async () => {
    const fatal = { message: 'Gateway Timeout', code: '504', status: 504 }

    const res = await cron.runCronJob('staffing-alerts', async () => {
      throw fatal
    })

    expect(res.status).toBe(500)
    const body = await res.json()
    // serverError's generic message — the raw Postgres/gateway text never
    // reaches the response body.
    expect(body.error).toMatch(/something went wrong/i)
    expect(JSON.stringify(body)).not.toContain('Gateway Timeout')

    // Sentry sees it twice on purpose: once tagged by notifyOps (cron job
    // name), once tagged by serverError (same `context` shape as every other
    // API route).
    expect(sentryCaptureException).toHaveBeenCalledTimes(2)
    expect(sentryCaptureException.mock.calls[0]).toEqual([fatal, { tags: { cron: 'staffing-alerts' } }])
    expect(sentryCaptureException.mock.calls[1]).toEqual([fatal, { tags: { context: 'cron:staffing-alerts' } }])
  })

  it('the ops alert email formats a plain-object Supabase error readably (no "[object Object]")', async () => {
    const pgError = { message: 'permission denied for table musicians', code: '42501', hint: 'Check the service role key' }

    await cron.runCronJob('pre-gig-reminders', async () => {
      throw pgError
    })

    expect(sendEmail).toHaveBeenCalledTimes(1)
    const call = sendEmail.mock.calls[0][0]
    expect(call.to).toBe('ops@example.com')
    expect(call.subject).toContain('pre-gig-reminders')
    expect(call.html).toContain('permission denied for table musicians')
    expect(call.html).toContain('code: 42501')
    expect(call.html).not.toContain('[object Object]')
  })

  it('still returns 500 when there is no PLATFORM_ADMIN_EMAIL to alert (alerting is best-effort)', async () => {
    delete process.env.PLATFORM_ADMIN_EMAIL

    const res = await cron.runCronJob('keepalive', async () => {
      throw new Error('boom')
    })

    expect(res.status).toBe(500)
    expect(sendEmail).not.toHaveBeenCalled()
    // Sentry still sees it even without an admin email to alert.
    expect(sentryCaptureException).toHaveBeenCalledTimes(2)
  })

  it('propagates a real Error instance (message + stack) to the alert email too', async () => {
    await cron.runCronJob('expire-offers', async () => {
      throw new Error('connection reset')
    })

    const call = sendEmail.mock.calls[0][0]
    expect(call.html).toContain('connection reset')
  })
})

describe('every cron route wires its fatal failures through runCronJob', () => {
  const CRON_DIR = join(process.cwd(), 'src', 'app', 'api', 'cron')
  const root = resolve(__dirname, '../../..')
  const read = (rel: string) => readFileSync(resolve(root, rel), 'utf-8')

  const routeFiles = readdirSync(CRON_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ job: d.name, path: join('src', 'app', 'api', 'cron', d.name, 'route.ts') }))

  it('finds all 7 cron routes', () => {
    expect(routeFiles.length).toBe(7)
  })

  it.each(routeFiles)('$job calls runCronJob with its own job name', ({ job, path }) => {
    const src = read(path)
    expect(src).toContain(`runCronJob('${job}'`)
  })

  it.each(routeFiles)('$job no longer hand-rolls notifyOps directly', ({ path }) => {
    // notifyOps is now called exactly once, from inside runCronJob — a route
    // calling it directly would double-alert.
    const src = read(path)
    expect(src).not.toMatch(/\bnotifyOps\(/)
  })

  it.each(routeFiles)('$job still runs requireCronAuth before anything else', ({ path }) => {
    const src = read(path)
    const authIdx = src.indexOf('requireCronAuth(request)')
    const jobIdx = src.indexOf('runCronJob(')
    expect(authIdx).toBeGreaterThan(-1)
    expect(authIdx).toBeLessThan(jobIdx)
  })
})
