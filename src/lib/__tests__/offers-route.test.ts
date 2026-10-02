import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { buildQuartet, QUARTET_RANKING, type QuartetFixture } from './helpers/quartet-fixture'
import type { Row } from './helpers/supabase-mock'

/**
 * POST /api/positions/[positionId]/offers → createOffer (src/lib/staffing/offers.ts),
 * the one server-side way an offer is made (target architecture PR 8).
 *
 * Driven against the quartet fixture with the real route, real createOffer and
 * the real offer-email module; only the email provider, the email log and the
 * venue lookup are stubbed. Covers: who may send, the refusals, what the offer
 * row records (093 columns), the expiry policy, supersede-after-send, the
 * history rows, running before migration 093 is pasted, and that the offer
 * email is the same email the old send-email route sent.
 */

const state = vi.hoisted(() => ({
  q: undefined as unknown as QuartetFixture,
  user: null as unknown,
  sendOfferFails: false,
  suppress: false,
}))

const ADMIN = { id: 'user-admin', email: 'admin@example.com' }

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => state.q.db,
  createClient: async () => ({
    from: (table: string) => state.q.db.from(table),
    auth: { getUser: async () => ({ data: { user: state.user } }) },
  }),
  getOrgAdminEmails: vi.fn(async () => ['admin@example.com']),
}))

vi.mock('@/lib/api-helpers', () => ({
  serverError: (message: string) => NextResponse.json({ error: message }, { status: 500 }),
}))

vi.mock('@/lib/email/send', () => ({
  sendContractOfferEmail: vi.fn(async () => {
    if (state.sendOfferFails) throw new Error('Resend is down')
    return state.suppress
      ? { id: null, subject: 'Offer', emailHtml: '<p>offer</p>', suppressed: true, suppressedRecipients: ['x'] }
      : { id: 'contract-offer', subject: 'Offer', emailHtml: '<p>offer</p>' }
  }),
  sendAdminOfferSentEmail: vi.fn(async () => ({ id: 'admin-offer-sent' })),
}))

vi.mock('@/lib/email/log', () => ({ logEmail: vi.fn(async () => {}) }))
vi.mock('@/lib/email/client', () => ({ logEmailConfig: vi.fn() }))
vi.mock('@/lib/venue-attach', () => ({ attachVenueDetails: vi.fn(async () => {}) }))

import { POST as offersPOST } from '@/app/api/positions/[positionId]/offers/route'
import { POST as sendEmailPOST } from '@/app/api/offers/send-email/route'
import * as email from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'

const R = QUARTET_RANKING
const q = () => state.q
const HOUR = 60 * 60 * 1000

beforeEach(() => {
  vi.clearAllMocks()
  state.q = buildQuartet()
  state.q.db.tables.staffing_events = []
  state.user = ADMIN
  state.sendOfferFails = false
  state.suppress = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

const post = (url: string, body?: unknown) =>
  new NextRequest(`http://localhost:3000${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

async function offer(positionId: string, body: Record<string, unknown>) {
  const res = await offersPOST(post(`/api/positions/${positionId}/offers`, body), {
    params: Promise.resolve({ positionId }),
  })
  q().hydrate()
  return { status: res.status, body: await res.json() }
}

const row = (id: string) => q().db.row('contract_offers', id)!
const events = () => q().db.tables.staffing_events
const mailCalls = (fn: unknown) => vi.mocked(fn as (...a: unknown[]) => unknown).mock.calls

// ---------------------------------------------------------------------------

describe('who may send, and the refusals', () => {
  it('refuses a signed-out caller (401) and writes nothing', async () => {
    state.user = null
    const res = await offer('pos-v1', { musicianId: R.v1[0] })
    expect(res.status).toBe(401)
    expect(q().db.tables.contract_offers).toHaveLength(0)
  })

  it('refuses an organization member who is not an owner or admin (403)', async () => {
    q().db.tables.organization_members[0].role = 'member'
    const res = await offer('pos-v1', { musicianId: R.v1[0] })
    expect(res).toMatchObject({ status: 403, body: { code: 'forbidden' } })
    expect(q().db.tables.contract_offers).toHaveLength(0)
  })

  it('refuses an admin of a different organization (403)', async () => {
    q().db.tables.organization_members[0].organization_id = 'org-elsewhere'
    const res = await offer('pos-v1', { musicianId: R.v1[0] })
    expect(res.status).toBe(403)
  })

  it('refuses a musician from another organization (400)', async () => {
    q().db.tables.musicians.push({ id: 'mus-outsider', organization_id: 'org-elsewhere', first_name: 'O', last_name: 'P', email: 'o@example.com', is_active: true })
    const res = await offer('pos-v1', { musicianId: 'mus-outsider' })
    expect(res).toMatchObject({ status: 400, body: { code: 'wrong_organization' } })
  })

  it('404s an unknown chair or musician', async () => {
    expect((await offer('pos-nope', { musicianId: R.v1[0] })).status).toBe(404)
    expect((await offer('pos-v1', { musicianId: 'mus-nope' })).status).toBe(404)
  })

  it('400s a missing musician or a malformed deadline', async () => {
    expect((await offer('pos-v1', {})).status).toBe(400)
    expect((await offer('pos-v1', { musicianId: R.v1[0], expiry: { kind: 'hours', hours: -1 } })).status).toBe(400)
    expect((await offer('pos-v1', { musicianId: R.v1[0], expiry: { kind: 'until', at: 'not a date' } })).status).toBe(400)
    expect(q().db.tables.contract_offers).toHaveLength(0)
  })

  it('refuses a chair someone already holds (409)', async () => {
    Object.assign(q().chair('v1'), { musician_id: R.v1[2], status: 'confirmed' })
    const res = await offer('pos-v1', { musicianId: R.v1[0] })
    expect(res).toMatchObject({ status: 409, body: { code: 'chair_filled' } })
  })

  it.each(['cancelled', 'completed'])('refuses a %s gig (409)', async (status) => {
    q().db.tables.projects[0].status = status
    q().hydrate()
    const res = await offer('pos-v1', { musicianId: R.v1[0] })
    expect(res).toMatchObject({ status: 409, body: { code: 'gig_closed' } })
  })

  it('refuses an inactive musician (409)', async () => {
    q().db.row('musicians', R.v1[0])!.is_active = false
    const res = await offer('pos-v1', { musicianId: R.v1[0] })
    expect(res).toMatchObject({ status: 409, body: { code: 'musician_inactive' } })
  })

  it('refuses a musician who already holds an open or accepted offer anywhere on the gig (the dialog check, unchanged)', async () => {
    q().sendOffer('v2', R.v1[0])
    const res = await offer('pos-v1', { musicianId: R.v1[0] })
    expect(res).toMatchObject({ status: 409, body: { code: 'musician_has_active_offer' } })
    expect(mailCalls(email.sendContractOfferEmail)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------

describe('a successful offer', () => {
  it('creates the offer, marks the chair offered, emails it and records who sent it and what was offered', async () => {
    const before = Date.now()
    const res = await offer('pos-v1', {
      musicianId: R.v1[0],
      customPay: 300,
      personalMessage: '  See you there  ',
      includeLeaderFee: true,
      leaderFeeAmount: 50,
    })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ success: true, delivery: 'sent', superseded: 0 })
    const o = row(res.body.offerId)
    expect(o).toMatchObject({
      project_position_id: 'pos-v1',
      musician_id: R.v1[0],
      status: 'pending',
      custom_pay: 300,
      personal_message: 'See you there',
      created_by: ADMIN.id,
      delivery_status: 'sent',
    })
    expect(o.terms_snapshot).toMatchObject({
      position: { id: 'pos-v1', instrument: 'Violin', chair_number: 1 },
      pay: { custom_pay: 300, include_leader_fee: true, leader_fee_amount: 50 },
      services: [
        expect.objectContaining({ id: 'svc-ceremony', base_pay: 150, leader_fee: 50 }),
        expect.objectContaining({ id: 'svc-cocktail', base_pay: 100, leader_fee: null }),
      ],
    })
    // 48 hours, the dialog's recommended default, when no deadline is given.
    const hours = (new Date(o.expires_at).getTime() - before) / HOUR
    expect(hours).toBeGreaterThanOrEqual(47.99)
    expect(hours).toBeLessThan(48.01)
    expect(q().chair('v1').status).toBe('offered')
    expect(mailCalls(email.sendContractOfferEmail)).toHaveLength(1)
    expect(mailCalls(email.sendAdminOfferSentEmail)).toHaveLength(1)
    expect(logEmail).toHaveBeenCalledTimes(1)
  })

  it('records offer.sent with the delivery in the staffing history', async () => {
    const res = await offer('pos-v1', { musicianId: R.v1[0] })
    expect(events()).toEqual([
      expect.objectContaining({
        organization_id: 'org-quartet',
        actor_type: 'admin',
        actor_id: ADMIN.id,
        entity_id: res.body.offerId,
        action: 'offer.sent',
        after: expect.objectContaining({ status: 'pending', position_id: 'pos-v1', musician_id: R.v1[0], delivery: 'sent' }),
      }),
    ])
  })

  it('a suppressed send (safe mode) keeps the offer, says so, and records "suppressed"', async () => {
    state.suppress = true
    const res = await offer('pos-v1', { musicianId: R.v1[0] })
    expect(res.body.delivery).toBe('suppressed')
    expect(row(res.body.offerId).delivery_status).toBe('suppressed')
    expect(mailCalls(email.sendAdminOfferSentEmail)).toHaveLength(0)
  })

  it('with "Send email" off: no email, no delivery status, and the previous offer is still replaced', async () => {
    const anna = q().sendOffer('v1', R.v1[0])
    const res = await offer('pos-v1', { musicianId: R.v1[1], sendEmail: false })

    expect(res.body).toMatchObject({ delivery: 'not_requested', superseded: 1 })
    expect(mailCalls(email.sendContractOfferEmail)).toHaveLength(0)
    expect(row(res.body.offerId).delivery_status).toBeNull()
    expect(row(anna.id as string).status).toBe('superseded')
    expect(q().liveOffers('v1').map((o) => o.musician_id)).toEqual([R.v1[1]])
  })
})

// ---------------------------------------------------------------------------

describe('the one expiry policy', () => {
  const span = async (expiry: unknown) => {
    const before = Date.now()
    const res = await offer('pos-v1', { musicianId: R.v1[0], expiry })
    const at = row(res.body.offerId).expires_at
    return at === null ? null : (new Date(at).getTime() - before) / HOUR
  }

  it('ASAP is 4 hours', async () => {
    expect(Math.round((await span({ kind: 'hours', hours: 4 }))!)).toBe(4)
  })

  it('"No expiration" stores no deadline', async () => {
    expect(await span({ kind: 'none' })).toBeNull()
  })

  it('a custom date is stored as the instant the browser resolved', async () => {
    const at = '2026-11-01T04:59:59.000Z'
    const res = await offer('pos-v1', { musicianId: R.v1[0], expiry: { kind: 'until', at } })
    expect(row(res.body.offerId).expires_at).toBe(at)
  })
})

// ---------------------------------------------------------------------------

describe('replacing the previous offer', () => {
  it('marks the earlier open offer "superseded" after the send, and records it', async () => {
    const anna = q().sendOffer('v1', R.v1[0])
    const res = await offer('pos-v1', { musicianId: R.v1[1] })

    expect(row(anna.id as string)).toMatchObject({ status: 'superseded' })
    expect(row(anna.id as string).responded_at).toBeTruthy()
    expect(res.body.superseded).toBe(1)
    expect(events().map((e: Row) => e.action)).toEqual(['offer.superseded', 'offer.sent'])
    expect(events()[0]).toMatchObject({
      entity_id: anna.id,
      after: expect.objectContaining({ status: 'superseded', replaced_by: res.body.offerId, musician_id: R.v1[0] }),
    })
    // Retired only once the send had happened: the delivery result is written
    // before the supersede.
    const ops = q().db.log.filter((e) => e.table === 'contract_offers' && e.operation === 'update')
    expect(ops.map((e) => Object.keys(e.payload as Row))).toEqual([['delivery_status'], ['status', 'responded_at']])
    expect((ops[1].payload as Row).status).toBe('superseded')
    expect(mailCalls(email.sendContractOfferEmail)).toHaveLength(1)
  })

  it('leaves accepted, declined and expired offers on the chair alone', async () => {
    const declined = q().sendOffer('v1', R.v1[0])
    declined.status = 'declined'
    const res = await offer('pos-v1', { musicianId: R.v1[1] })
    expect(res.body.superseded).toBe(0)
    expect(row(declined.id as string).status).toBe('declined')
  })

  it('a failed send while someone else is waiting changes nothing and records nothing', async () => {
    const anna = q().sendOffer('v1', R.v1[0])
    state.sendOfferFails = true

    const res = await offer('pos-v1', { musicianId: R.v1[1] })

    expect(res).toMatchObject({ status: 502, body: { code: 'send_failed' } })
    expect(res.body.error).toMatch(/could not be sent \(Resend is down\), so the offer was not created/)
    expect(row(anna.id as string).status).toBe('pending')
    expect(q().offers('v1')).toHaveLength(1)
    expect(events()).toEqual([])
  })
})

// ---------------------------------------------------------------------------

describe('before migration 093 is pasted', () => {
  /** Make contract_offers refuse what 093 adds, the way PostgREST and Postgres do. */
  function without093() {
    const db = q().db
    const from = db.from.bind(db)
    db.from = (table: string) => {
      const builder = from(table) as unknown as Record<string, (...a: unknown[]) => unknown>
      if (table !== 'contract_offers') return builder as never
      const insert = builder.insert.bind(builder)
      builder.insert = (r: unknown) => {
        if ((r as Row).created_by !== undefined) {
          return { select: () => ({ single: async () => ({ data: null, error: { code: 'PGRST204', message: "Could not find the 'created_by' column" } }) }) }
        }
        return insert(r)
      }
      const update = builder.update.bind(builder)
      builder.update = (patch: unknown) => {
        if ((patch as Row).status === 'superseded') {
          const refused = { then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { code: '23514', message: 'violates check constraint' } }).then(ok) }
          const chain: Record<string, unknown> = {}
          for (const m of ['eq', 'neq', 'in', 'select']) chain[m] = () => ({ ...chain, ...refused })
          return chain
        }
        if ((patch as Row).delivery_status !== undefined) {
          const refused = { then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { code: 'PGRST204', message: "Could not find the 'delivery_status' column" } }).then(ok) }
          return { eq: () => refused }
        }
        return update(patch)
      }
      return builder as never
    }
  }

  it('still makes, sends and supersedes; old replaced offers are written "expired" as before', async () => {
    without093()
    const anna = q().sendOffer('v1', R.v1[0])

    const res = await offer('pos-v1', { musicianId: R.v1[1] })

    expect(res.status).toBe(200)
    expect(res.body.delivery).toBe('sent')
    const created = row(res.body.offerId)
    expect(created.status).toBe('pending')
    expect(created.created_by).toBeUndefined()
    expect(row(anna.id as string).status).toBe('expired')
    expect(events()[0]).toMatchObject({ action: 'offer.superseded', after: expect.objectContaining({ status: 'expired' }) })
  })
})

// ---------------------------------------------------------------------------

describe('the offer email is the one the old send-email route sent', () => {
  /** Strip what legitimately differs between two sends: the link token and the deadline. */
  function normalise(args: unknown) {
    const rest = { ...(args as Row) }
    delete rest.responseUrl
    delete rest.expiresAt
    return rest
  }

  /** The old path: the browser inserted the offer, then called send-email. */
  async function legacySend(key: 'v1' | 'v2', musicianId: string, customPay: number | null, leader: Row) {
    const legacy = q().sendOffer(key, musicianId, { customPay })
    const res = await sendEmailPOST(post('/api/offers/send-email', { offerId: legacy.id, ...leader }))
    expect(res.status).toBe(200)
  }

  const cases: { name: string; key: 'v1' | 'v2'; customPay: number | null; leader: Row }[] = [
    { name: 'chair 1, leader fee ticked, custom pay', key: 'v1', customPay: 200, leader: { includeLeaderFee: true, leaderFeeAmount: 50 } },
    { name: 'chair 1, leader fee not ticked', key: 'v1', customPay: 150, leader: { includeLeaderFee: false, leaderFeeAmount: 0 } },
    { name: 'chair 1, no pay set, leader choice left to the old default', key: 'v1', customPay: null, leader: {} },
    { name: 'chair 2, no pay set', key: 'v2', customPay: null, leader: { includeLeaderFee: false, leaderFeeAmount: 0 } },
  ]

  it.each(cases)('$name', async ({ key, customPay, leader }) => {
    const musicianId = R[key][0]
    const res = await offer(`pos-${key}`, { musicianId, customPay, ...leader })
    expect(res.status).toBe(200)
    const viaRoute = mailCalls(email.sendContractOfferEmail)[0][0]
    const adminViaRoute = mailCalls(email.sendAdminOfferSentEmail)[0][0]

    // Fresh gig, same musician and pay, the old way.
    state.q = buildQuartet()
    vi.clearAllMocks()
    await legacySend(key, musicianId, customPay, leader)
    const viaLegacy = mailCalls(email.sendContractOfferEmail)[0][0]
    const adminViaLegacy = mailCalls(email.sendAdminOfferSentEmail)[0][0]

    expect(normalise(viaRoute)).toEqual(normalise(viaLegacy))
    expect(normalise(adminViaRoute)).toEqual(normalise(adminViaLegacy))
  })
})
