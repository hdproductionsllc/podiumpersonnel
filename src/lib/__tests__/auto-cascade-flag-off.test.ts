import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { render } from '@react-email/render'
import { buildQuartet, cascadeConstraints, QUARTET_CHAIRS, QUARTET_ORG, QUARTET_RANKING, type ChairKey, type QuartetFixture } from './helpers/quartet-fixture'

/**
 * Auto-offer OFF must be byte-identical to master (owner decision W7).
 *
 * The golden files under __golden__/ were written from master's code (the
 * decline route, the expire cron and the two admin templates were unchanged
 * from master when they were captured, before the cascade engine landed).
 * Each test here replays the same flow on today's code with the switch off,
 * and with the switch's column absent (096 not pasted), and compares:
 *
 *   - every email the flow asks to send, with every argument, in order;
 *   - every email_logs row it writes;
 *   - the HTML of the two admin templates whose wording changes when the
 *     switch is ON (decline / expiry notices), rendered without the new prop.
 *
 * A difference here means an organization that never turned auto-offer on
 * would see something new. Do not regenerate the goldens to make this pass.
 */

const NOW = new Date('2026-10-01T15:00:00.000Z')

const state = vi.hoisted(() => ({ q: undefined as unknown as QuartetFixture }))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => state.q.db,
  getOrgAdminEmails: vi.fn(async () => ['admin@example.com']),
}))

vi.mock('@/lib/api-helpers', () => ({
  getOrgVertical: vi.fn(async () => ({ terms: undefined })),
}))

vi.mock('@/lib/email/send', () => {
  const sent = (id: string) => vi.fn(async () => ({ id, subject: id, emailHtml: `<p>${id}</p>` }))
  return {
    formatPerformanceDateForSubject: vi.fn(() => 'Nov 7'),
    sendContractOfferEmail: sent('contract-offer'),
    sendAdminOfferSentEmail: sent('admin-offer-sent'),
    sendOfferDeclinedEmail: sent('offer-declined'),
    sendAdminOfferResponseEmail: sent('admin-offer-response'),
    sendOfferExpiredEmail: sent('offer-expired'),
    sendSubDeclinedFindAnotherEmail: sent('sub-declined'),
    sendMusicianReleasedEmail: sent('musician-released'),
    sendCascadeExhaustedEmail: sent('cascade-exhausted'),
    sendEmail: sent('generic'),
  }
})

vi.mock('@/lib/email/log', () => ({ logEmail: vi.fn(async () => {}) }))
vi.mock('@/lib/email/client', () => ({ logEmailConfig: vi.fn() }))
vi.mock('@/lib/venue-attach', () => ({ attachVenueDetails: vi.fn(async () => {}) }))

// The ranking engine is not under test; the fixture's ranked list stands in for it.
vi.mock('@/lib/staffing/candidates', () => ({
  getNextCandidates: vi.fn(async (_db: unknown, positionId: string) => {
    const key = (Object.keys(QUARTET_CHAIRS) as ChairKey[]).find((k) => QUARTET_CHAIRS[k].id === positionId)!
    const id = state.q.nextInLine(key)
    const m = id ? state.q.db.row('musicians', id) : null
    return {
      candidates: m
        ? [{ id: m.id, first_name: m.first_name, last_name: m.last_name, email: m.email, call_order: m.call_order, is_leader: m.is_leader, has_conflict: false }]
        : [],
      totalAvailable: m ? 1 : 0,
    }
  }),
}))

import { POST as declinePOST } from '@/app/api/gig/[token]/decline/route'
import { GET as expireGET } from '@/app/api/cron/expire-offers/route'
import * as email from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { AdminOfferResponseEmail } from '@/lib/email/templates/admin-offer-response'
import { OfferExpiredEmail } from '@/lib/email/templates/offer-expired'

const q = () => state.q

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  process.env.CRON_SECRET = 'test-secret'
  delete process.env.CRON_ENABLED
  state.q = buildQuartet()
  state.q.db.constraint = cascadeConstraints
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const post = (url: string) => new Request(`http://localhost:3000${url}`, { method: 'POST' })
const PAST = () => new Date(Date.now() - 60 * 60 * 1000).toISOString()

/** Every email the flow asked for, by function, in call order, with all arguments. */
function sentEmails() {
  const kinds = [
    'sendContractOfferEmail',
    'sendAdminOfferSentEmail',
    'sendOfferDeclinedEmail',
    'sendAdminOfferResponseEmail',
    'sendOfferExpiredEmail',
    'sendSubDeclinedFindAnotherEmail',
    'sendMusicianReleasedEmail',
    'sendCascadeExhaustedEmail',
  ] as const
  const calls: { kind: string; order: number; args: unknown }[] = []
  for (const kind of kinds) {
    const fn = vi.mocked(email[kind] as unknown as (...a: unknown[]) => unknown)
    fn.mock.calls.forEach((args, i) => calls.push({ kind, order: fn.mock.invocationCallOrder[i], args: args[0] }))
  }
  return calls.sort((a, b) => a.order - b.order).map(({ kind, args }) => ({ kind, args }))
}

/**
 * The business flow, flag off: four opening offers; V2 declines; Viola's
 * offer lapses with someone left on the list; Cello's lapses with nobody left.
 */
async function runFlow() {
  const R = QUARTET_RANKING
  const v2 = q().sendOffer('v2', R.v2[0])
  q().sendOffer('viola', R.viola[0], { expiresAt: PAST() })
  // Cello's list is used up: two earlier offers ended, the third one lapses.
  q().sendOffer('cello', R.cello[0], { customPay: 300 }).status = 'declined'
  q().sendOffer('cello', R.cello[1]).status = 'expired'
  q().sendOffer('cello', R.cello[2], { expiresAt: PAST() })
  q().hydrate()

  const res = await declinePOST(post(`/api/gig/${v2.token}/decline`), { params: Promise.resolve({ token: v2.token as string }) })
  expect(res.status).toBeLessThan(400)

  q().hydrate()
  const cron = await expireGET(
    new NextRequest('http://localhost:3000/api/cron/expire-offers', { headers: { authorization: 'Bearer test-secret' } })
  )
  expect((await cron.json()).expired).toBe(2)

  return {
    emails: sentEmails(),
    emailLogs: vi.mocked(logEmail).mock.calls.map((c) => c[0]),
    offers: q().db.tables.contract_offers.map((o) => ({ id: o.id, musician_id: o.musician_id, status: o.status })),
    chairs: q().db.tables.project_positions.map((p) => ({ id: p.id, status: p.status, musician_id: p.musician_id })),
  }
}

describe('auto-offer off: the same emails as master', () => {
  it('with the switch column absent (096 not pasted yet)', async () => {
    const out = await runFlow()
    await expect(JSON.stringify(out, null, 2)).toMatchFileSnapshot('./__golden__/flag-off-flow.json')
  })

  it('with the switch present and off', async () => {
    q().db.tables.organizations = [{ ...QUARTET_ORG, auto_cascade: false, allow_worker_drop: false }]
    for (const p of q().db.tables.project_positions) p.auto_cascade_disabled = false
    const out = await runFlow()
    await expect(JSON.stringify(out, null, 2)).toMatchFileSnapshot('./__golden__/flag-off-flow.json')
  })

  it('with the switch off and a chair switched out (nothing changes either)', async () => {
    q().db.tables.organizations = [{ ...QUARTET_ORG, auto_cascade: false, allow_worker_drop: false }]
    for (const p of q().db.tables.project_positions) p.auto_cascade_disabled = true
    const out = await runFlow()
    await expect(JSON.stringify(out, null, 2)).toMatchFileSnapshot('./__golden__/flag-off-flow.json')
  })
})

describe('the admin notices render exactly as on master when nothing was done automatically', () => {
  const base = {
    organizationName: 'Test Quartet Co',
    projectName: 'Smith Wedding',
    musicianName: 'V2A Player',
    instrument: 'Violin',
    chairNumber: 2,
    totalChairs: 2,
    dashboardUrl: 'https://app.example.com/dashboard/projects',
  }

  it('decline notice', async () => {
    const html = await render(
      AdminOfferResponseEmail({ ...base, musicianEmail: 'mus-v2-a@example.com', status: 'declined', responseNotes: 'Out of town' })
    )
    await expect(html).toMatchFileSnapshot('./__golden__/admin-offer-response.declined.html')
  })

  it('expiry notice, someone next on the list', async () => {
    const html = await render(
      OfferExpiredEmail({ ...base, nextCandidate: { name: 'V2B Player', email: 'mus-v2-b@example.com', callOrder: 2 } })
    )
    await expect(html).toMatchFileSnapshot('./__golden__/offer-expired.next.html')
  })

  it('expiry notice, nobody left', async () => {
    const html = await render(OfferExpiredEmail({ ...base, nextCandidate: null }))
    await expect(html).toMatchFileSnapshot('./__golden__/offer-expired.none.html')
  })
})
