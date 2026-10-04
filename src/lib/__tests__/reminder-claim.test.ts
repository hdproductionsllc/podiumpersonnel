import { describe, it, expect, vi } from 'vitest'
import { claimReminder, REMINDER_REPEAT_WINDOW_MS } from '@/lib/reminders/claim'

/**
 * claimReminder: one reminder per person, however many requests arrive.
 * The race itself is proven against real Postgres in db/reminder-claims.test.ts;
 * these pin the query shape and the fallbacks.
 */

function fakeClient(result: { data: unknown; error: unknown }) {
  const calls: { method: string; args: unknown[] }[] = []
  const chain: Record<string, unknown> = {}
  for (const m of ['from', 'update', 'eq', 'or']) {
    chain[m] = (...args: unknown[]) => {
      calls.push({ method: m, args })
      return chain
    }
  }
  chain.select = async (...args: unknown[]) => {
    calls.push({ method: 'select', args })
    return result
  }
  return { client: chain as never, calls }
}

const NOW = new Date('2026-10-04T12:00:00Z')

describe('claimReminder', () => {
  it('claims when nobody reminded this person recently, in one conditional write', async () => {
    const { client, calls } = fakeClient({ data: [{ id: 'c1' }], error: null })
    expect(await claimReminder(client, 'gig_detail_confirmations', 'c1', NOW)).toBe('claimed')
    expect(calls.find((c) => c.method === 'from')!.args).toEqual(['gig_detail_confirmations'])
    expect(calls.find((c) => c.method === 'update')!.args).toEqual([{ last_reminded_at: NOW.toISOString() }])
    const cutoff = new Date(NOW.getTime() - REMINDER_REPEAT_WINDOW_MS).toISOString()
    expect(calls.find((c) => c.method === 'or')!.args).toEqual([`last_reminded_at.is.null,last_reminded_at.lt.${cutoff}`])
  })

  it('says "recently reminded" when the write matched nothing', async () => {
    const { client } = fakeClient({ data: [], error: null })
    expect(await claimReminder(client, 'music_confirmations', 'c1', NOW)).toBe('recently_reminded')
  })

  it('before migration 102 (no column) the reminder still goes out', async () => {
    const { client } = fakeClient({ data: null, error: { code: '42703', message: 'column does not exist' } })
    expect(await claimReminder(client, 'gig_detail_confirmations', 'c1', NOW)).toBe('unguarded')
  })

  it('an unexpected error still sends rather than silently dropping the reminder', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeClient({ data: null, error: { code: '57014', message: 'timeout' } })
    expect(await claimReminder(client, 'gig_detail_confirmations', 'c1', NOW)).toBe('unguarded')
  })
})
