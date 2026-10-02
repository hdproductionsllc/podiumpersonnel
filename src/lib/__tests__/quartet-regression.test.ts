import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { buildQuartet, cascadeConstraints, QUARTET_CHAIRS, QUARTET_RANKING, QUARTET_ORG, type ChairKey, type QuartetFixture } from './helpers/quartet-fixture'
import type { Row } from './helpers/supabase-mock'

/**
 * END-TO-END regression scenario: a quartet wedding, start to finish
 * (target architecture section 7.1, "do not break the business").
 *
 * Every step a musician, a cron or an admin API takes goes through the real
 * route handler against the in-memory database; only the browser-side offer
 * creation is done by the fixture (it has no route; audit R-20). If a refactor
 * changes who ends up in which chair, which offers read what, which emails go
 * out, or what the payment rows say, this is the test that goes red.
 *
 *   offers out -> V1 accepts -> V2 declines -> next in line accepts
 *   -> Viola expires (cron) -> next in line accepts -> Cello accepts
 *   -> Viola asks for a sub -> approved -> sub accepts -> original released
 *   -> payments generated -> a second run changes nothing
 *
 * Not covered here, because the code for it does not exist yet: the pre-gig
 * reminder approval flow, project completion / pay summary email, and the
 * call_scoped_requirements flag (target architecture phases 2-3).
 */

const state = vi.hoisted(() => ({ q: undefined as unknown as QuartetFixture, user: { id: 'user-admin', email: 'admin@example.com' } as unknown }))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => state.q.db,
  createClient: async () => ({
    from: (table: string) => state.q.db.from(table),
    auth: { getUser: async () => ({ data: { user: state.user } }) },
  }),
  getOrgAdminEmails: vi.fn(async () => ['admin@example.com']),
}))

vi.mock('@/lib/api-helpers', () => ({
  requireOrgAdmin: async () => ({
    supabase: state.q.db,
    membership: { organization_id: 'org-quartet' },
    error: null,
  }),
  apiSuccess: (data: unknown, status = 200) => NextResponse.json(data, { status }),
  apiError: (message: string, status = 400) => NextResponse.json({ error: message }, { status }),
  serverError: (message: string) => NextResponse.json({ error: message }, { status: 500 }),
  getOrgPlan: vi.fn(async () => null),
}))

vi.mock('@/lib/email/send', () => {
  const sent = (id: string) => vi.fn(async () => ({ id, subject: id, emailHtml: `<p>${id}</p>` }))
  return {
    formatPerformanceDateForSubject: vi.fn(() => 'Sat, Nov 7'),
    sendContractOfferEmail: sent('contract-offer'),
    sendAdminOfferSentEmail: sent('admin-offer-sent'),
    sendOfferAcceptedEmail: sent('offer-accepted'),
    sendOfferDeclinedEmail: sent('offer-declined'),
    sendAdminOfferResponseEmail: sent('admin-offer-response'),
    sendOfferExpiredEmail: sent('offer-expired'),
    sendMusicianReleasedEmail: sent('musician-released'),
    sendSubDeclinedFindAnotherEmail: sent('sub-declined'),
    sendSubRequestApprovedEmail: sent('sub-request-approved'),
    sendAdminSubRequestEmail: sent('admin-sub-request'),
    sendEmail: sent('generic'),
  }
})

vi.mock('@/lib/email/log', () => ({ logEmail: vi.fn(async () => {}) }))
vi.mock('@/lib/email/client', () => ({ logEmailConfig: vi.fn() }))
vi.mock('@/lib/venue-attach', () => ({ attachVenueDetails: vi.fn(async () => {}) }))

// The ranking engine is not under test here; the fixture's ranked list stands in for it.
vi.mock('@/lib/staffing/candidates', () => ({
  getNextCandidates: vi.fn(async (_db: unknown, positionId: string) => {
    const key = (Object.keys(QUARTET_CHAIRS) as ChairKey[]).find((k) => QUARTET_CHAIRS[k].id === positionId)!
    const id = state.q.nextInLine(key)
    const m = id ? state.q.db.row('musicians', id) : null
    return {
      candidates: m ? [{ first_name: m.first_name, last_name: m.last_name, email: m.email, call_order: m.call_order, has_conflict: false }] : [],
      totalAvailable: m ? 1 : 0,
    }
  }),
}))

import { POST as acceptPOST } from '@/app/api/gig/[token]/accept/route'
import { POST as declinePOST } from '@/app/api/gig/[token]/decline/route'
import { POST as requestSubPOST } from '@/app/api/gig/[token]/request-sub/route'
import { POST as sendEmailPOST } from '@/app/api/offers/send-email/route'
import { POST as approvePOST } from '@/app/api/substitutions/[requestId]/approve/route'
import { POST as generatePOST } from '@/app/api/payments/generate/route'
import { GET as expireGET } from '@/app/api/cron/expire-offers/route'
import * as email from '@/lib/email/send'

const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString()

let errorSpy: MockInstance

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'test-secret'
  delete process.env.CRON_ENABLED
  state.q = buildQuartet()
  // Run the whole business under 095's indexes and 094's CHECK: no write in the
  // flow may ever produce two live or two accepted offers on a chair.
  state.q.db.constraint = cascadeConstraints
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Drivers: one per actor, each a real route call
// ---------------------------------------------------------------------------

const q = () => state.q
const post = (url: string, body?: unknown) =>
  new Request(`http://localhost:3000${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

/** Admin sends an offer and the email goes out (dialog inserts, then /api/offers/send-email). */
async function offer(key: ChairKey, musicianId: string, opts: Parameters<QuartetFixture['sendOffer']>[2] = {}) {
  const row = q().sendOffer(key, musicianId, opts)
  const res = await sendEmailPOST(post('/api/offers/send-email', { offerId: row.id }) as NextRequest)
  expect(res.status).toBe(200)
  return row
}

async function offerNext(key: ChairKey, opts: Parameters<QuartetFixture['sendOffer']>[2] = {}) {
  const next = q().nextInLine(key)
  expect(next, `someone left to ask for ${key}`).not.toBeNull()
  return offer(key, next!, opts)
}

async function respond(row: Row, action: 'accept' | 'decline') {
  q().hydrate()
  const route = action === 'accept' ? acceptPOST : declinePOST
  const token = row.token as string
  const res = await route(post(`/api/gig/${token}/${action}`), { params: Promise.resolve({ token }) })
  expect(res.status).toBeLessThan(400)
}

const generate = async () => (await generatePOST(post('/api/payments/generate', { projectId: 'proj-wedding' }))).json()

const calls = (fn: unknown) => vi.mocked(fn as () => unknown).mock.calls as unknown as Array<[Record<string, unknown>]>
const seatedMusician = (key: ChairKey) => q().chair(key).musician_id

// ---------------------------------------------------------------------------

describe('quartet wedding, start to finish', () => {
  it('runs offer -> accept -> chair confirmed -> payments, through every cascade branch', async () => {
    const R = QUARTET_RANKING

    // 1. Opening offers go out to the top of each list. Viola's has already lapsed.
    const v1 = await offer('v1', R.v1[0])
    const v2 = await offer('v2', R.v2[0])
    const viola = await offer('viola', R.viola[0], { expiresAt: PAST })
    const cello = await offer('cello', R.cello[0], { customPay: 300 })
    expect(email.sendContractOfferEmail).toHaveBeenCalledTimes(4)
    for (const key of ['v1', 'v2', 'viola', 'cello'] as ChairKey[]) {
      expect(q().chair(key).status).toBe('offered')
      expect(q().liveOffers(key)).toHaveLength(1)
    }

    // 2. V1 accepts: chair confirmed, both sides told.
    await respond(v1, 'accept')
    expect(q().chair('v1')).toMatchObject({ musician_id: R.v1[0], status: 'confirmed' })
    expect(q().db.row('contract_offers', v1.id)!.status).toBe('accepted')

    // 3. V2 declines: chair reopens; nothing is sent on by itself; the admin clicks next.
    await respond(v2, 'decline')
    expect(q().chair('v2')).toMatchObject({ musician_id: null, status: 'vacant' })
    expect(q().liveOffers('v2')).toHaveLength(0)
    const v2Next = await offerNext('v2')
    expect(v2Next.musician_id).toBe(R.v2[1])
    await respond(v2Next, 'accept')
    expect(seatedMusician('v2')).toBe(R.v2[1])

    // 4. The cron expires Viola's lapsed offer, vacates the chair and names the next in line to admins.
    const res = await expireGET(new NextRequest('http://localhost:3000/api/cron/expire-offers', { headers: { authorization: 'Bearer test-secret' } }))
    expect((await res.json()).expired).toBe(1)
    expect(q().db.row('contract_offers', viola.id)!.status).toBe('expired')
    expect(q().chair('viola')).toMatchObject({ musician_id: null, status: 'vacant' })
    const [expiredMail] = calls(email.sendOfferExpiredEmail)[0]
    expect(expiredMail.nextCandidate).toMatchObject({ email: `${R.viola[1]}@example.com` })

    const violaNext = await offerNext('viola')
    expect(violaNext.musician_id).toBe(R.viola[1])
    await respond(violaNext, 'accept')

    // 5. Cello accepts the whole-gig fee offered.
    await respond(cello, 'accept')

    // Four chairs filled by the people the process says, nobody double-booked, nothing left live.
    expect(['v1', 'v2', 'viola', 'cello'].map((k) => seatedMusician(k as ChairKey))).toEqual([R.v1[0], R.v2[1], R.viola[1], R.cello[0]])
    expect(q().db.tables.project_positions.every((p) => p.status === 'confirmed')).toBe(true)
    expect((['v1', 'v2', 'viola', 'cello'] as ChairKey[]).flatMap((k) => q().liveOffers(k))).toHaveLength(0)

    // 6. Viola asks for a sub for the Ceremony, the admin approves, the sub accepts.
    const subRes = await requestSubPOST(
      post(`/api/gig/${violaNext.token}/request-sub`, {
        serviceId: 'svc-ceremony',
        reason: 'Family conflict',
        subFirstName: 'Sam',
        subLastName: 'Sub',
        subEmail: 'sam.sub@example.com',
        subPhone: '555-0100',
        subInstrumentId: 'inst-viola',
      }),
      { params: Promise.resolve({ token: violaNext.token as string }) }
    )
    expect((await subRes.json()).success).toBe(true)
    expect(email.sendAdminSubRequestEmail).toHaveBeenCalledTimes(1)

    q().hydrate()
    const request = q().db.tables.substitution_requests[0]
    const approved = await approvePOST(post(`/api/substitutions/${request.id}/approve`), { params: Promise.resolve({ requestId: request.id as string }) })
    expect(approved.status).toBe(200)
    expect(email.sendSubRequestApprovedEmail).toHaveBeenCalledTimes(1)
    // Until the sub says yes, the original still holds the chair.
    expect(seatedMusician('viola')).toBe(R.viola[1])

    const subOffer = q().offers('viola').find((o) => o.id !== violaNext.id && o.id !== viola.id)!
    await respond(subOffer, 'accept')
    const subMusician = q().chair('viola').musician_id as string
    expect(subMusician).not.toBe(R.viola[1])
    expect(q().db.row('musicians', subMusician)).toMatchObject({ first_name: 'Sam', last_name: 'Sub' })
    expect(q().db.row('contract_offers', violaNext.id)!.status).toBe('released')
    expect(q().db.row('substitution_requests', request.id as string)!.status).toBe('filled')
    expect(calls(email.sendMusicianReleasedEmail)[0][0].to).toBe(`${R.viola[1]}@example.com`)

    // 7. Payments. Per service on service rates; the whole-gig fee once; the sub is paid, the released musician is not.
    q().hydrate()
    expect((await generate()).created).toBe(7)
    const rows = q().db.tables.payments
    const pay = (musicianId: string) =>
      rows.filter((p) => p.musician_id === musicianId).map((p) => [p.service_id, p.amount, !!p.is_leader_fee]).sort()

    expect(pay(R.v1[0])).toEqual([['svc-cocktail', 100, false], ['svc-ceremony', 200, true]].sort())
    expect(pay(R.v2[1])).toEqual([['svc-cocktail', 100, false], ['svc-ceremony', 150, false]].sort())
    expect(pay(subMusician)).toEqual([['svc-cocktail', 100, false], ['svc-ceremony', 150, false]].sort())
    expect(pay(R.cello[0])).toEqual([['svc-ceremony', 300, false]])
    expect(pay(R.viola[1])).toEqual([])
    expect(rows.every((p) => p.organization_id === QUARTET_ORG.id && p.status === 'unpaid')).toBe(true)

    // A second run is a no-op: no one is paid twice.
    expect((await generate()).created).toBe(0)
    expect(q().db.tables.payments).toHaveLength(7)

    // Emails: counted by kind, so a template that stops (or starts) firing is visible.
    const count = (fn: unknown) => vi.mocked(fn as () => unknown).mock.calls.length
    expect({
      offer: count(email.sendContractOfferEmail),
      offerSentToAdmin: count(email.sendAdminOfferSentEmail),
      accepted: count(email.sendOfferAcceptedEmail),
      declined: count(email.sendOfferDeclinedEmail),
      adminResponse: count(email.sendAdminOfferResponseEmail),
      expired: count(email.sendOfferExpiredEmail),
      released: count(email.sendMusicianReleasedEmail),
      subRequestToAdmin: count(email.sendAdminSubRequestEmail),
      subApproved: count(email.sendSubRequestApprovedEmail),
    }).toEqual({
      offer: 4 + 2 + 1, // opening four, two next-in-line, the sub's offer from approve
      offerSentToAdmin: 4 + 2 + 1,
      accepted: 5,
      declined: 1,
      adminResponse: 6, // five accepts and one decline
      expired: 1,
      released: 1,
      subRequestToAdmin: 1,
      subApproved: 1,
    })

    // The staffing history (migration 092): one row per transition, all in this org.
    const history = q().db.tables.staffing_events
    const tally = history.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.action]: (acc[e.action] ?? 0) + 1 }), {})
    expect(tally).toEqual({
      'offer.sent': 4 + 2 + 1, // as the offer emails above
      'offer.accepted': 4 + 1, // the four chairs' accepts and the sub's (the accepted emails above)
      'offer.declined': 1,
      'offer.expired': 1,
      'offer.released': 1, // the original viola, when the sub took the chair
      'substitution.requested': 1,
      'substitution.approved': 1,
      'substitution.filled': 1,
    })
    expect(history.every((e) => e.organization_id === QUARTET_ORG.id)).toBe(true)
    expect(history.filter((e) => e.actor_type === 'system').map((e) => e.entity_id)).toEqual([viola.id])

    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('never mentions calls, services-as-calls or requirements in what it sends (call_scoped_requirements is off)', async () => {
    const v1 = await offer('v1', QUARTET_RANKING.v1[0])
    await respond(v1, 'accept')

    const sentText = JSON.stringify([
      calls(email.sendContractOfferEmail),
      calls(email.sendOfferAcceptedEmail),
      calls(email.sendAdminOfferResponseEmail),
    ])
    expect(sentText).not.toMatch(/call[- _]?scoped|requirement/i)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('starts every chair vacant with a three-deep ranking', () => {
    for (const key of Object.keys(QUARTET_CHAIRS) as ChairKey[]) {
      expect(q().chair(key)).toMatchObject({ status: 'vacant', musician_id: null })
      expect(QUARTET_RANKING[key]).toHaveLength(3)
      expect(q().nextInLine(key)).toBe(QUARTET_RANKING[key][0])
    }
  })

  // The remaining steps of section 7.1 have no code to characterize yet.
  it.todo('pre-gig reminder is drafted and approved (no draft/approve step exists in the offer flow today)')
  it.todo('project completes and the pay summary email is sent (after-gig.test.ts covers the summary in isolation)')
  it.todo('1099 aggregation is unchanged (needs the payments + tax-year layer under the same fixture)')
  it.todo('Ceremony-only sub request leaves the original on Cocktail Hour (audit R-19: a partial sub transfers the whole chair today)')
})
