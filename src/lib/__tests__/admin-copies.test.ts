import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Copies for the organization (David, 2026-10-04): every email Podium sends to
 * a musician also goes to that company's owners and admins, marked as a copy,
 * with the musician's personal links switched off.
 */

const state = vi.hoisted(() => ({ admins: ['owner@example.com', 'admin@example.com'] as string[], copyFails: false }))

vi.mock('@/lib/supabase/server', () => ({
  getOrgAdminEmails: vi.fn(async () => state.admins),
}))
vi.mock('@/lib/email/log', () => ({ hasRecentFailure: async () => false, logEmail: vi.fn(async () => {}) }))
vi.mock('@/lib/email/send', () => ({
  sendEmail: vi.fn(async () => {
    if (state.copyFails) throw new Error('Resend is down')
    return { id: 'copy-1' }
  }),
}))

import { notify } from '@/lib/notify'
import { copyHtml, copySubject, MUSICIAN_EMAIL_TYPES } from '@/lib/notify/copies'
import { sendEmail } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'

const APP = 'https://app.podiumpersonnel.com'
const ORIGINAL =
  `<html><body><p>Hi Shelly,</p>` +
  `<a href="${APP}/gig/abc123">Respond to the offer</a> ` +
  `<a href="${APP}/api/offers/o1/calendar?token=abc123">Add to calendar</a> ` +
  `<a href="${APP}/report/tok">Fill in the report</a> ` +
  `<a href="https://maps.google.com/?q=Whittemore+House">Whittemore House</a>` +
  `</body></html>`

describe('the copy itself', () => {
  const details = { recipientName: 'Shelly Ren', recipientEmail: 'shelly@example.com', subject: 'How did Smith Wedding go?' }

  it('says who it was sent to, in the subject and in a banner at the top', () => {
    expect(copySubject(details)).toBe('Copy: How did Smith Wedding go? (sent to Shelly Ren)')
    const html = copyHtml(ORIGINAL, details)
    expect(html.indexOf('Copy for your records')).toBeGreaterThan(html.indexOf('<body>'))
    expect(html.indexOf('Copy for your records')).toBeLessThan(html.indexOf('Hi Shelly'))
    expect(html).toContain('Shelly Ren (shelly@example.com)')
  })

  it("switches off the links that act as the musician, and keeps the rest of the email", () => {
    const html = copyHtml(ORIGINAL, details)
    expect(html).not.toContain(`${APP}/gig/abc123`)
    expect(html).not.toContain(`${APP}/report/tok`)
    expect(html).not.toContain('token=abc123')
    expect(html).toContain('Respond to the offer')
    expect(html).toContain('Fill in the report')
    expect(html).toContain('https://maps.google.com/?q=Whittemore+House')
  })

  it('falls back to the address when there is no name, and escapes what it shows', () => {
    expect(copySubject({ recipientEmail: 'x@example.com', subject: 'S' })).toBe('Copy: S (sent to x@example.com)')
    expect(copyHtml('<p>hi</p>', { recipientName: '<b>Eve</b>', recipientEmail: 'e@example.com', subject: 'S' })).toContain('&lt;b&gt;Eve&lt;/b&gt;')
  })
})

describe('notify sends the copy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.admins = ['owner@example.com', 'admin@example.com']
    state.copyFails = false
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  const musicianEmail = (type: string, result: Record<string, unknown> = { id: 'm1', emailHtml: ORIGINAL }) =>
    notify(
      {
        type,
        record: (r) => ({
          organizationId: 'org-1',
          recipientEmail: 'shelly@example.com',
          recipientName: 'Shelly Ren',
          subject: 'How did Smith Wedding go?',
          emailType: type,
          musicianId: 'mus-1',
          projectId: 'proj-1',
          body: (r as { emailHtml?: string } | null)?.emailHtml,
        }),
      },
      { email: async () => result }
    )

  it('to every owner and admin, for an email to a musician', async () => {
    await musicianEmail('gig_report_request')
    const calls = vi.mocked(sendEmail).mock.calls
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toMatchObject({
      to: ['owner@example.com', 'admin@example.com'],
      subject: 'Copy: How did Smith Wedding go? (sent to Shelly Ren)',
    })
    expect((calls[0][0] as { html: string }).html).toContain('Copy for your records')
  })

  it('covers every kind of email Podium sends a musician', () => {
    for (const t of ['contract_offer', 'offer_reminder_auto', 'offer_accepted', 'offer_declined', 'gig_details', 'gig_report_request', 'music_available', 'w9_request']) {
      expect(MUSICIAN_EMAIL_TYPES.has(t), t).toBe(true)
    }
  })

  it('not for notices the admins already receive themselves', async () => {
    for (const t of ['offer_expired', 'gig_report_submitted', 'pay_summary', 'staffing_alert', 'admin_offer_response']) {
      expect(MUSICIAN_EMAIL_TYPES.has(t), t).toBe(false)
      await musicianEmail(t)
    }
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('not when the musician never got it (safe mode held it back)', async () => {
    await musicianEmail('contract_offer', { id: null, emailHtml: ORIGINAL, suppressed: true })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('a copy that fails never fails the musician\'s email, and is recorded as failed', async () => {
    state.copyFails = true
    await expect(musicianEmail('gig_details')).resolves.toMatchObject({ id: 'm1' })
    const failed = vi.mocked(logEmail).mock.calls.map((c) => c[0]).find((r) => r.emailType === 'admin_copy')
    expect(failed).toMatchObject({ status: 'failed', emailType: 'admin_copy' })
  })

  it('a successful copy adds no line to the Emails page (only the original is listed)', async () => {
    await musicianEmail('gig_details')
    const types = vi.mocked(logEmail).mock.calls.map((c) => c[0].emailType)
    expect(types).toEqual(['gig_details'])
  })

  it('nothing to send when the company has no owner or admin email', async () => {
    state.admins = []
    await musicianEmail('offer_accepted')
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
