import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Email kill-switch safety net.
 *
 * The hard rule: while EMAIL_SAFE_MODE is on, no recipient outside
 * EMAIL_ALLOWLIST may ever receive mail. These tests exercise the actual
 * filterRecipients logic and assert the gate is wired at every send site.
 */

const root = resolve(__dirname, '../../..')
const ORIG = { ...process.env }

async function loadClient(env: Record<string, string | undefined>) {
  vi.resetModules()
  // Resend's constructor throws on an empty key; the kill switch is what's
  // under test, so seed a dummy key unless the caller overrides it.
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test_dummy'
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  return import('../email/client')
}

afterEach(() => {
  process.env = { ...ORIG }
})

// ---------------------------------------------------------------------------
// A6: a suppressed send must never look like a sent one. `resend` is mocked
// so these tests can assert on whether the provider was actually called,
// not just on what filterRecipients decided.
// ---------------------------------------------------------------------------

const resendState = vi.hoisted(() => ({ sendMock: undefined as any }))

vi.mock('resend', () => {
  // A real class, not an arrow function/object literal: vi.fn's constructor
  // proxying uses Reflect.construct, which throws on anything without a
  // [[Construct]] slot. `new Resend(...)` in client.ts requires this shape.
  class MockResend {
    emails = { send: (...args: unknown[]) => resendState.sendMock(...args) }
  }
  return { Resend: MockResend }
})

async function loadSend(env: Record<string, string | undefined>) {
  vi.resetModules()
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test_dummy'
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  resendState.sendMock = vi.fn(async () => ({ data: { id: 'resend-id-1' }, error: null }))
  return import('../email/send')
}

const adminWelcomeParams = {
  userName: 'Jamie',
  organizationName: 'Test Orchestra',
  dashboardUrl: 'https://app.example.com/dashboard',
}

describe('a suppressed send is reported honestly, not as a success (A6)', () => {
  it('suppressed: returns suppressed=true, id=null, and never calls Resend', async () => {
    const { sendAdminWelcomeEmail } = await loadSend({
      EMAIL_SAFE_MODE: 'true',
      EMAIL_ALLOWLIST: 'team@podium.com',
    })
    const result: any = await sendAdminWelcomeEmail({ to: 'real-user@gmail.com', ...adminWelcomeParams })
    expect(result.suppressed).toBe(true)
    expect(result.suppressedRecipients).toEqual(['real-user@gmail.com'])
    expect(result.id).toBeNull()
    expect(resendState.sendMock).not.toHaveBeenCalled()
    // The FIRST import of send.ts also cold-compiles ~26 React-email templates;
    // the default 5s test timeout is too tight for that one-time cost.
  }, 20000)

  it('allowlisted recipient in safe mode: returns suppressed=false and calls Resend once', async () => {
    const { sendAdminWelcomeEmail } = await loadSend({
      EMAIL_SAFE_MODE: 'true',
      EMAIL_ALLOWLIST: 'team@podium.com',
    })
    const result: any = await sendAdminWelcomeEmail({ to: 'team@podium.com', ...adminWelcomeParams })
    expect(result.suppressed).toBe(false)
    expect(result.suppressedRecipients).toEqual([])
    expect(result.id).toBe('resend-id-1')
    expect(resendState.sendMock).toHaveBeenCalledTimes(1)
  })

  it('safe mode off: a real send still returns suppressed=false', async () => {
    const { sendAdminWelcomeEmail } = await loadSend({ EMAIL_SAFE_MODE: 'false' })
    const result: any = await sendAdminWelcomeEmail({ to: 'anyone@gmail.com', ...adminWelcomeParams })
    expect(result.suppressed).toBe(false)
    expect(result.suppressedRecipients).toEqual([])
    expect(resendState.sendMock).toHaveBeenCalledTimes(1)
  })
})

describe('filterRecipients (the kill switch)', () => {
  it('FAIL-SAFE: defaults to safe mode ON when EMAIL_SAFE_MODE is unset', async () => {
    const { isEmailSafeMode, filterRecipients } = await loadClient({
      EMAIL_SAFE_MODE: undefined,
      EMAIL_ALLOWLIST: 'ok@test.com',
    })
    expect(isEmailSafeMode()).toBe(true)
    const { allowed, suppressed } = filterRecipients('musician@real.com')
    expect(allowed).toEqual([])
    expect(suppressed).toEqual(['musician@real.com'])
  })

  it('suppresses everyone when allowlist is empty', async () => {
    const { filterRecipients } = await loadClient({
      EMAIL_SAFE_MODE: 'true',
      EMAIL_ALLOWLIST: undefined,
    })
    const { allowed, suppressed } = filterRecipients(['a@x.com', 'b@y.com'])
    expect(allowed).toEqual([])
    expect(suppressed).toEqual(['a@x.com', 'b@y.com'])
  })

  it('lets only allowlisted addresses through (case-insensitive), suppresses the rest', async () => {
    const { filterRecipients } = await loadClient({
      EMAIL_SAFE_MODE: 'true',
      EMAIL_ALLOWLIST: 'team@podium.com, henry@example.com',
    })
    const { allowed, suppressed } = filterRecipients([
      'HENRY@example.com',
      'realmusician@gmail.com',
      'team@podium.com',
    ])
    expect(allowed).toEqual(['HENRY@example.com', 'team@podium.com'])
    expect(suppressed).toEqual(['realmusician@gmail.com'])
  })

  it('passes everyone through when safe mode is explicitly OFF', async () => {
    const { isEmailSafeMode, filterRecipients } = await loadClient({
      EMAIL_SAFE_MODE: 'false',
      EMAIL_ALLOWLIST: undefined,
    })
    expect(isEmailSafeMode()).toBe(false)
    const { allowed, suppressed } = filterRecipients(['a@x.com', 'b@y.com'])
    expect(allowed).toEqual(['a@x.com', 'b@y.com'])
    expect(suppressed).toEqual([])
  })

  it('treats common falsy strings as OFF only when explicit', async () => {
    for (const v of ['false', '0', 'off', 'no', 'FALSE']) {
      const { isEmailSafeMode } = await loadClient({ EMAIL_SAFE_MODE: v })
      expect(isEmailSafeMode(), `EMAIL_SAFE_MODE=${v}`).toBe(false)
    }
    for (const v of ['true', '1', 'on', 'yes', 'anything']) {
      const { isEmailSafeMode } = await loadClient({ EMAIL_SAFE_MODE: v })
      expect(isEmailSafeMode(), `EMAIL_SAFE_MODE=${v}`).toBe(true)
    }
  })
})

describe('the gate is wired at every send chokepoint', () => {
  it('both resend.emails.send calls in send.ts are guarded by filterRecipients', () => {
    const src = readFileSync(resolve(root, 'src/lib/email/send.ts'), 'utf-8')
    // Exactly two send sites must exist, and both must filter recipients first.
    const sendCalls = src.match(/resend\.emails\.send/g) || []
    expect(sendCalls.length).toBe(2)
    const filterCalls = src.match(/filterRecipients\(/g) || []
    expect(filterCalls.length).toBe(2)
    // Neither send site may pass the raw `to` straight through.
    expect(src).toContain('to: allowed')
  })
})

describe('cron jobs honor CRON_ENABLED', () => {
  const guardedCrons = [
    'src/app/api/cron/offer-reminders/route.ts',
    'src/app/api/cron/expire-offers/route.ts',
    'src/app/api/cron/pre-gig-reminders/route.ts',
    'src/app/api/cron/staffing-alerts/route.ts',
    'src/app/api/cron/complete-projects/route.ts',
  ]
  guardedCrons.forEach((route) => {
    it(`${route} short-circuits when cron is disabled`, () => {
      const src = readFileSync(resolve(root, route), 'utf-8')
      expect(src).toContain('cronDisabledResponse')
    })
  })
})

describe('cross-tenant guards', () => {
  it('send-gig-details verifies project belongs to the caller org', () => {
    const src = readFileSync(resolve(root, 'src/lib/send-gig-details.ts'), 'utf-8')
    expect(src).toContain('project.organization_id !== organizationId')
  })
  it('send-gig-details-reminder verifies the send record belongs to the caller org', () => {
    const src = readFileSync(
      resolve(root, 'src/app/api/projects/[projectId]/send-gig-details-reminder/route.ts'),
      'utf-8'
    )
    expect(src).toContain('sendRecord.organization_id !== mem.organization_id')
  })
})
