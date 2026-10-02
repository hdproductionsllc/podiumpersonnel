import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { buildQuartet, QUARTET_RANKING as R, type QuartetFixture } from './helpers/quartet-fixture'
import type { Row } from './helpers/supabase-mock'
import { isDueForReminder, REMINDER_LEAD_HOURS } from '@/lib/staffing/reminders'

/**
 * The offer-reminders cron now runs hourly instead of once a day (the plan,
 * B1.2). Driven hour by hour against the quartet fixture with the real route,
 * and email mocked, to show:
 *
 *   - every offer still gets exactly ONE reminder (musician) and one heads-up
 *     (admins), however many hourly runs see it, and two overlapping runs
 *     still send one;
 *   - when: in its last 12 hours and past the halfway point of its own window,
 *     so a short offer is not reminded straight after it was sent;
 *   - the same offers are reminded as under the daily run: an offer with the
 *     usual 48-hour window, whatever hour its deadline falls on.
 */

const state = vi.hoisted(() => ({ q: undefined as unknown as QuartetFixture }))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => state.q.db,
  getOrgAdminEmails: vi.fn(async () => ['admin@example.com']),
}))

vi.mock('@/lib/api-helpers', () => ({
  serverError: (message: string) => NextResponse.json({ error: message }, { status: 500 }),
}))

vi.mock('@/lib/email/send', () => ({
  formatPerformanceDateForSubject: vi.fn(() => 'Sat, Nov 7'),
  sendOfferReminderEmail: vi.fn(async () => ({ id: 'reminder', subject: 'Reminder', emailHtml: '<p>r</p>' })),
  sendOfferExpiringSoonEmail: vi.fn(async () => ({ id: 'heads-up', subject: 'Expiring', emailHtml: '<p>h</p>' })),
  sendEmail: vi.fn(async () => ({ id: 'ops' })),
}))

vi.mock('@/lib/email/log', () => ({ logEmail: vi.fn(async () => {}) }))

import { GET } from '@/app/api/cron/offer-reminders/route'
import * as email from '@/lib/email/send'

const HOUR = 60 * 60 * 1000
// A Monday, 10:05 UTC. Runs are at minute 23, as vercel.json schedules them.
const T0 = new Date('2026-10-05T10:05:00Z').getTime()

const run = () =>
  GET(new NextRequest('http://localhost:3000/api/cron/offer-reminders', { headers: { authorization: 'Bearer test-secret' } }))

const reminders = () => vi.mocked(email.sendOfferReminderEmail).mock.calls.map((c) => c[0] as Row)
const headsUps = () => vi.mocked(email.sendOfferExpiringSoonEmail).mock.calls.map((c) => c[0] as Row)

/** Run the cron at minute 23 of every hour from `from` to `to`; returns when each offer was reminded. */
async function hourlyRuns(from: number, to: number): Promise<Map<string, number>> {
  const remindedAt = new Map<string, number>()
  const first = Math.ceil((from - 23 * 60 * 1000) / HOUR) * HOUR + 23 * 60 * 1000
  for (let t = first; t <= to; t += HOUR) {
    vi.setSystemTime(t)
    await run()
    for (const o of state.q.db.tables.contract_offers) {
      if (o.reminder_sent_at && !remindedAt.has(o.id as string)) remindedAt.set(o.id as string, t)
    }
  }
  return remindedAt
}

function offerAt(sentAt: number, hours: number | null, chair: 'v1' | 'v2' | 'viola' | 'cello' = 'v1', musician = R.v1[0]): Row {
  vi.setSystemTime(sentAt)
  return state.q.sendOffer(chair, musician, {
    expiresAt: hours === null ? null : new Date(sentAt + hours * HOUR).toISOString(),
    supersede: false,
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'test-secret'
  delete process.env.CRON_ENABLED
  state.q = buildQuartet()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('hourly reminders: one per offer', () => {
  it('a 48-hour offer is reminded once, about 12 hours before its deadline', async () => {
    const offer = offerAt(T0, 48)
    const at = await hourlyRuns(T0, T0 + 50 * HOUR)

    expect(reminders()).toHaveLength(1)
    expect(headsUps()).toHaveLength(1)
    expect(reminders()[0]).toMatchObject({ to: `${R.v1[0]}@example.com`, responseUrl: expect.stringContaining(offer.token as string) })
    expect(headsUps()[0]).toMatchObject({ to: ['admin@example.com'] })

    const left = (new Date(offer.expires_at as string).getTime() - at.get(offer.id as string)!) / HOUR
    expect(left).toBeLessThanOrEqual(REMINDER_LEAD_HOURS)
    expect(left).toBeGreaterThan(REMINDER_LEAD_HOURS - 1)
  })

  it('a 24-hour offer is not reminded in the hour after it was sent, but halfway through', async () => {
    const offer = offerAt(T0, 24)
    const at = await hourlyRuns(T0, T0 + 26 * HOUR)

    expect(reminders()).toHaveLength(1)
    const sinceSent = (at.get(offer.id as string)! - T0) / HOUR
    expect(sinceSent).toBeGreaterThanOrEqual(12)
    expect(sinceSent).toBeLessThan(13)
  })

  it('a 4-hour (ASAP) offer is reminded once, with about two hours left', async () => {
    const offer = offerAt(T0, 4)
    const at = await hourlyRuns(T0, T0 + 5 * HOUR)

    expect(reminders()).toHaveLength(1)
    const left = (new Date(offer.expires_at as string).getTime() - at.get(offer.id as string)!) / HOUR
    expect(left).toBeLessThanOrEqual(2)
    expect(left).toBeGreaterThan(1)
  })

  it('two runs at the same moment send one reminder', async () => {
    offerAt(T0, 48)
    vi.setSystemTime(T0 + 40 * HOUR)
    await Promise.all([run(), run()])
    await run()
    expect(reminders()).toHaveLength(1)
    expect(headsUps()).toHaveLength(1)
  })

  it('answered, withdrawn and no-deadline offers get none', async () => {
    const accepted = offerAt(T0, 48, 'v1', R.v1[0])
    const declined = offerAt(T0, 48, 'v2', R.v2[0])
    const rescinded = offerAt(T0, 48, 'viola', R.viola[0])
    offerAt(T0, null, 'cello', R.cello[0])
    accepted.status = 'accepted'
    declined.status = 'declined'
    rescinded.status = 'rescinded'

    await hourlyRuns(T0, T0 + 50 * HOUR)
    expect(reminders()).toHaveLength(0)
  })
})

describe('the same offers as the daily run reminded', () => {
  it('48-hour offers ending at every hour of a day: each reminded exactly once, as before', async () => {
    // One offer per deadline hour across a whole day. The daily 12:23 run
    // reminded every one of them once (each deadline falls in exactly one
    // 24-hour window after a 12:23 run).
    const offers: Row[] = []
    for (let h = 0; h < 24; h++) {
      const chair = (['v1', 'v2', 'viola', 'cello'] as const)[h % 4]
      offers.push(offerAt(T0 + h * HOUR, 48, chair, R[chair][Math.floor(h / 4) % 3]))
    }
    const at = await hourlyRuns(T0, T0 + 75 * HOUR)

    expect(reminders()).toHaveLength(24)
    expect(new Set(reminders().map((r) => r.responseUrl)).size).toBe(24)
    for (const o of offers) expect(at.has(o.id as string), o.id as string).toBe(true)
  })
})

describe('isDueForReminder', () => {
  const now = new Date(T0)
  const iso = (ms: number) => new Date(ms).toISOString()

  it('due in the last 12 hours, past halfway', () => {
    expect(isDueForReminder({ status: 'pending', sent_at: iso(T0 - 40 * HOUR), expires_at: iso(T0 + 8 * HOUR) }, now)).toBe(true)
    expect(isDueForReminder({ status: 'viewed', sent_at: iso(T0 - 40 * HOUR), expires_at: iso(T0 + 8 * HOUR) }, now)).toBe(true)
  })

  it('not with more than 12 hours left', () => {
    expect(isDueForReminder({ status: 'pending', sent_at: iso(T0 - 30 * HOUR), expires_at: iso(T0 + 13 * HOUR) }, now)).toBe(false)
  })

  it('not before halfway', () => {
    expect(isDueForReminder({ status: 'pending', sent_at: iso(T0 - HOUR), expires_at: iso(T0 + 3 * HOUR) }, now)).toBe(false)
  })

  it('without a sent time, the 12-hour rule alone', () => {
    expect(isDueForReminder({ status: 'pending', sent_at: null, expires_at: iso(T0 + 3 * HOUR) }, now)).toBe(true)
  })

  it('never twice, never lapsed, never without a deadline', () => {
    const base = { status: 'pending', sent_at: iso(T0 - 40 * HOUR) }
    expect(isDueForReminder({ ...base, expires_at: iso(T0 + HOUR), reminder_sent_at: iso(T0 - HOUR) }, now)).toBe(false)
    expect(isDueForReminder({ ...base, expires_at: iso(T0 - HOUR) }, now)).toBe(false)
    expect(isDueForReminder({ ...base, expires_at: null }, now)).toBe(false)
  })
})
