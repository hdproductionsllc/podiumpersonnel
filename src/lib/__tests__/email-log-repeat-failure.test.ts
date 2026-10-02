import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * hasRecentFailure (src/lib/email/log.ts): the check notify makes before it
 * writes a failed row, so a job that retries a refused send records it once a
 * day instead of on every attempt.
 *
 *   - it asks for exactly this send: organization, type, recipient, project,
 *     offer (a missing project or offer matches only rows without one), with
 *     status 'failed', inside the window;
 *   - every column it filters on is a real email_logs column (038), so the
 *     check works whether or not 097 has been applied;
 *   - any read problem answers false: the failure is recorded rather than lost.
 */

type Call = [method: string, ...args: unknown[]]
let calls: Call[]
let result: { data: unknown[] | null; error: unknown }

function builder() {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'gte']) {
    b[m] = (...args: unknown[]) => {
      calls.push([m, ...args])
      return b
    }
  }
  b.limit = async (n: number) => {
    calls.push(['limit', n])
    return result
  }
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      calls.push(['from', table])
      return builder()
    },
  }),
}))

import { hasRecentFailure } from '@/lib/email/log'

const send = {
  organizationId: 'org-1',
  recipientEmail: 'sam@example.com',
  subject: 'Pay summary',
  emailType: 'pay_summary',
  projectId: 'proj-1',
  offerId: null,
}
const DAY = 24 * 60 * 60 * 1000

beforeEach(() => {
  calls = []
  result = { data: [], error: null }
})

describe('hasRecentFailure', () => {
  it('asks for a failed row of exactly this send inside the window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-02T12:00:00Z'))
    try {
      expect(await hasRecentFailure(send, DAY)).toBe(false)
    } finally {
      vi.useRealTimers()
    }
    expect(calls).toEqual([
      ['from', 'email_logs'],
      ['select', 'id'],
      ['eq', 'organization_id', 'org-1'],
      ['eq', 'email_type', 'pay_summary'],
      ['eq', 'recipient_email', 'sam@example.com'],
      ['eq', 'status', 'failed'],
      ['gte', 'sent_at', '2026-10-01T12:00:00.000Z'],
      ['eq', 'project_id', 'proj-1'],
      ['is', 'offer_id', null],
      ['limit', 1],
    ])
  })

  it('answers true when such a row exists', async () => {
    result = { data: [{ id: 'log-1' }], error: null }
    expect(await hasRecentFailure(send, DAY)).toBe(true)
  })

  it('answers false on a read error, so the failure is still recorded', async () => {
    result = { data: null, error: { message: 'timeout' } }
    expect(await hasRecentFailure(send, DAY)).toBe(false)
  })

  it('filters only on columns email_logs has had since migration 038', () => {
    const table = readFileSync(join(process.cwd(), 'supabase', 'migrations', '038_add_email_logs.sql'), 'utf8')
    for (const column of ['organization_id', 'email_type', 'recipient_email', 'status', 'sent_at', 'project_id', 'offer_id']) expect(table, column).toMatch(new RegExp(`^\\s+${column}\\s`, 'm'))
  })
})
