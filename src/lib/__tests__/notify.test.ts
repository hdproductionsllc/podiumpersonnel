import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'

/**
 * The notify layer (Release 2 A2.1; target architecture section 8 row 22).
 *
 *   - a send that goes out is recorded exactly as its call site's record says,
 *     with nothing added (so every pre-notify email_logs row is unchanged);
 *   - a send the provider refuses is recorded as failed (channel, when, why)
 *     and the very same error is rethrown, so callers behave as before;
 *   - recordSent: false writes nothing on success but still records a failure;
 *   - every send in the app goes through notify(): no other module writes
 *     email_logs or calls a send function outside a notify() payload.
 */

vi.mock('@/lib/email/log', () => ({ logEmail: vi.fn(async () => {}), hasRecentFailure: vi.fn(async () => false) }))

import { hasRecentFailure, logEmail } from '@/lib/email/log'
import { notify, describeFailure } from '@/lib/notify'

const logged = () => vi.mocked(logEmail).mock.calls.map((c) => c[0])

const row = (r: { id?: string | null; subject?: string } | null) => ({
  organizationId: 'org-1',
  recipientEmail: 'sam@example.com',
  recipientName: 'Sam Player',
  subject: r?.subject || 'Fallback subject',
  emailType: 'offer_reminder',
  musicianId: 'mus-1',
  projectId: 'proj-1',
  offerId: 'offer-1',
  resendEmailId: r?.id || null,
})

beforeEach(() => {
  vi.mocked(logEmail).mockClear()
  vi.mocked(hasRecentFailure).mockReset()
  vi.mocked(hasRecentFailure).mockResolvedValue(false)
})

describe('a send that goes out', () => {
  it('returns the provider result unchanged and records exactly the call site row', async () => {
    const result = { id: 'resend-1', subject: 'Reminder: Gala', emailHtml: '<p>x</p>', suppressed: false as const }
    const record = vi.fn(row)
    const out = await notify({ type: 'offer_reminder', record }, { email: async () => result })

    expect(out).toBe(result)
    expect(record).toHaveBeenCalledWith(result)
    // Byte-identical to what the site wrote before notify: no channel, no failure fields.
    expect(logged()).toEqual([row(result)])
    expect(Object.keys(logged()[0])).not.toContain('channel')
  })

  it('writes one row per entry when the record is a list', async () => {
    await notify(
      { type: 'position_unassigned_admin', record: () => [row(null), { ...row(null), recipientEmail: 'b@example.com' }] },
      { email: async () => ({ id: 'r' }) }
    )
    expect(logged().map((r) => r.recipientEmail)).toEqual(['sam@example.com', 'b@example.com'])
  })

  it('writes nothing when the record says null (no organization to file it under)', async () => {
    await notify({ type: 'ops_alert', record: () => null }, { email: async () => ({ id: 'r' }) })
    expect(logEmail).not.toHaveBeenCalled()
  })

  it('recordSent: false writes nothing for a send that went out', async () => {
    const record = vi.fn(row)
    await notify({ type: 'admin_offer_sent', recordSent: false, record }, { email: async () => ({ id: 'r' }) })
    expect(logEmail).not.toHaveBeenCalled()
    expect(record).not.toHaveBeenCalled()
  })
})

describe('a send the provider refuses', () => {
  it('records the failure and rethrows the very same error', async () => {
    const error = Object.assign(new Error('Failed to send email: rate limited'), { subject: 'Reminder: Gala | Apr 3' })
    const record = vi.fn(row)
    await expect(
      notify({ type: 'offer_reminder', record }, { email: async () => { throw error } })
    ).rejects.toBe(error)

    expect(record).toHaveBeenCalledWith(null)
    expect(logged()).toHaveLength(1)
    const failed = logged()[0]
    expect(failed).toMatchObject({
      ...row(null),
      // The rendered subject rides on the error from send.ts.
      subject: 'Reminder: Gala | Apr 3',
      resendEmailId: null,
      body: null,
      status: 'failed',
      channel: 'email',
      failureReason: 'Failed to send email: rate limited',
    })
    expect(new Date(failed.failedAt!).toString()).not.toBe('Invalid Date')
  })

  it("uses the site's subject when the send failed before it was rendered", async () => {
    await expect(
      notify({ type: 'offer_reminder', record: row }, { email: async () => { throw new Error('render blew up') } })
    ).rejects.toThrow('render blew up')
    expect(logged()[0]).toMatchObject({ subject: 'Fallback subject', status: 'failed', failureReason: 'render blew up' })
  })

  it('still records a failure for a send that is never recorded when it goes out', async () => {
    await expect(
      notify(
        { type: 'admin_offer_sent', recordSent: false, record: () => ({ ...row(null), emailType: 'admin_offer_sent' }) },
        { email: async () => { throw new Error('down') } }
      )
    ).rejects.toThrow('down')
    expect(logged()).toEqual([expect.objectContaining({ emailType: 'admin_offer_sent', status: 'failed' })])
  })

  it('a send that keeps failing is recorded once a day, not on every retry, and still rethrows', async () => {
    vi.mocked(hasRecentFailure).mockResolvedValue(true)
    const error = new Error('down')
    await expect(
      notify({ type: 'offer_reminder', record: row }, { email: async () => { throw error } })
    ).rejects.toBe(error)
    expect(hasRecentFailure).toHaveBeenCalledWith(row(null), 24 * 60 * 60 * 1000)
    expect(logEmail).not.toHaveBeenCalled()
  })

  it('never asks about earlier failures for a send that went out', async () => {
    await notify({ type: 'offer_reminder', record: row }, { email: async () => ({ id: 'r' }) })
    expect(hasRecentFailure).not.toHaveBeenCalled()
  })

  it('a record function that cannot describe the failure never hides the error', async () => {
    const error = new Error('down')
    await expect(
      notify(
        { type: 'x', record: (r) => { if (!r) throw new Error('bad record'); return row(r) } },
        { email: async () => { throw error } }
      )
    ).rejects.toBe(error)
    expect(logEmail).not.toHaveBeenCalled()
  })

  it('keeps long provider messages to a bounded reason', () => {
    expect(describeFailure(new Error('x'.repeat(2000))).reason).toHaveLength(500)
    expect(describeFailure('plain string')).toEqual({ reason: 'plain string', subject: null })
  })
})

// ---------------------------------------------------------------------------
// The one send path: a source scan of the whole app.
// ---------------------------------------------------------------------------

const root = resolve(__dirname, '../../..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

const files = sourceFiles(join(root, 'src')).map((path) => ({
  path: path.slice(root.length + 1).replace(/\\/g, '/'),
  src: readFileSync(path, 'utf-8'),
}))

const SEND_FN = /\b(send[A-Z]\w*Email|sendEmail)\(/

describe('every send goes through notify()', () => {
  it('only the notify layer writes email_logs rows', () => {
    const writers = files
      .filter((f) => /\blogEmail\(/.test(f.src) && !f.path.startsWith('src/lib/email/log.ts'))
      .map((f) => f.path)
    expect(writers).toEqual(['src/lib/notify/index.ts'])
  })

  it('every module that calls an email send function also routes it through notify()', () => {
    const offenders = files
      .filter((f) => !f.path.startsWith('src/lib/email/send.ts'))
      // notify itself sends the admins' copy of a musician email (copies.ts).
      .filter((f) => !f.path.startsWith('src/lib/notify/'))
      .filter((f) => /from '@\/lib\/email\/send'|from '\.\/send'|from '@\/lib\/email'/.test(f.src))
      .filter((f) => f.src.split('\n').some((line) => SEND_FN.test(line) && !/^\s*(import|export|\*|\/\/)/.test(line)))
      .filter((f) => !/from '@\/lib\/notify'/.test(f.src))
      .map((f) => f.path)
    expect(offenders).toEqual([])
  })

  it('each such call sits inside a notify() email payload', () => {
    // A send call's line is either `email: () => sendX(` / `sendX(` right after it.
    const bare: string[] = []
    for (const f of files) {
      if (f.path.startsWith('src/lib/email/send.ts') || f.path.startsWith('src/lib/notify/')) continue
      const lines = f.src.split('\n')
      lines.forEach((line, i) => {
        const m = line.match(/\bawait\s+(send[A-Z]\w*Email|sendEmail)\(/)
        if (m && m[1] !== 'sendOfferEmail' && m[1] !== 'sendPaymentFailedEmail') bare.push(`${f.path}:${i + 1}`)
      })
    }
    // sendOfferEmail (staffing/offer-email.ts) and sendPaymentFailedEmail
    // (billing-notices.ts) are wrappers whose own sends go through notify().
    expect(bare).toEqual([])
  })

  it("a failed staffing alert does not count as sent for the cron's once-per-threshold check", () => {
    const src = files.find((f) => f.path === 'src/app/api/cron/staffing-alerts/route.ts')!.src
    const dedup = src.slice(src.indexOf("from('email_logs')"), src.indexOf('.maybeSingle()', src.indexOf("from('email_logs')")))
    expect(dedup).toContain(".neq('status', 'failed')")
  })

  it('Resend is called only from send.ts', () => {
    const callers = files.filter((f) => /resend\.emails\.send/.test(f.src)).map((f) => f.path)
    expect(callers).toEqual(['src/lib/email/send.ts'])
  })

  it('there is no SMS provider anywhere (Podium sends no texts)', () => {
    const sms = files.filter((f) => /twilio|messagebird|vonage|\bsns\b.*publish/i.test(f.src)).map((f) => f.path)
    expect(sms).toEqual([])
  })
})
