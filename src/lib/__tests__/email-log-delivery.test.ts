import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * email_logs writes (src/lib/email/log.ts) around migration 097:
 *   - a row for a send that went out names none of 097's columns, so it is
 *     the same insert as before 097;
 *   - a failed row names channel / failed_at / failure_reason;
 *   - with 097 not applied yet, the failed row is still written, with the
 *     failure moved into metadata.
 */

const db = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[],
  results: [] as { error: unknown }[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        db.inserts.push({ table, ...row })
        return db.results.shift() ?? { error: null }
      },
    }),
  }),
}))

import { logEmail } from '@/lib/email/log'

const base = {
  organizationId: 'org-1',
  recipientEmail: 'sam@example.com',
  subject: 'Reminder: Gala',
  emailType: 'offer_reminder',
}

beforeEach(() => {
  db.inserts = []
  db.results = []
})

describe('logEmail and migration 097', () => {
  it('a sent row is the pre-097 insert, column for column', async () => {
    await logEmail({ ...base, resendEmailId: 'r-1', body: '<p>Hi</p>' })
    expect(db.inserts).toEqual([
      {
        table: 'email_logs',
        organization_id: 'org-1',
        recipient_email: 'sam@example.com',
        recipient_name: null,
        subject: 'Reminder: Gala',
        email_type: 'offer_reminder',
        musician_id: null,
        project_id: null,
        offer_id: null,
        resend_email_id: 'r-1',
        status: 'sent',
        metadata: {},
        body: 'Hi',
      },
    ])
  })

  it('a failed row names the delivery columns', async () => {
    await logEmail({ ...base, status: 'failed', channel: 'email', failedAt: '2026-10-02T12:00:00.000Z', failureReason: 'down' })
    expect(db.inserts[0]).toMatchObject({
      status: 'failed',
      channel: 'email',
      failed_at: '2026-10-02T12:00:00.000Z',
      failure_reason: 'down',
    })
  })

  it('without 097 the failure is still recorded, with the reason in metadata', async () => {
    db.results.push({ error: { code: 'PGRST204', message: "Could not find the 'channel' column" } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await logEmail({ ...base, status: 'failed', channel: 'email', failedAt: '2026-10-02T12:00:00.000Z', failureReason: 'down' })
    expect(db.inserts).toHaveLength(2)
    const retry = db.inserts[1]
    expect(retry).not.toHaveProperty('channel')
    expect(retry).not.toHaveProperty('failed_at')
    expect(retry).not.toHaveProperty('failure_reason')
    expect(retry).toMatchObject({ status: 'failed', metadata: { failedAt: '2026-10-02T12:00:00.000Z', failureReason: 'down' } })
    expect(warn.mock.calls[0][0]).toContain('097')
    warn.mockRestore()
  })

  it('any other insert error is not retried', async () => {
    db.results.push({ error: { code: '23502', message: 'null value' } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await logEmail({ ...base, status: 'failed', channel: 'email', failureReason: 'down' })
    expect(db.inserts).toHaveLength(1)
    warn.mockRestore()
  })
})
