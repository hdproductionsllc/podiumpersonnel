import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import { NextRequest } from 'next/server'
import { render } from '@react-email/render'
import {
  buildQuartet,
  cascadeConstraints,
  QUARTET_CHAIRS,
  QUARTET_ORG,
  QUARTET_RANKING,
  QUARTET_SERVICES,
  type ChairKey,
  type QuartetFixture,
} from './helpers/quartet-fixture'
import type { Row } from './helpers/supabase-mock'
import { MockPgError } from './helpers/staffing-rpcs'

/**
 * The auto-cascade engine (src/lib/staffing/cascade.ts) on the quartet
 * fixture, with the organization's auto-offer switch ON, through the real
 * decline route and the real expire cron:
 *
 *   decline -> the next person is offered, on the ended offer's terms
 *   expiry  -> the next person is offered
 *   a conflicted musician is passed over
 *   nobody left -> ONE "please pick someone" email, however often it is asked
 *   chair filled / gig cancelled, completed or draft / chair opted out /
 *     switch off / gig started -> nothing
 *   two runs for the same ended offer, or a decline racing the cron -> exactly
 *     one automatic offer (the database's unique index is tested for real in
 *     db/cascade-rpcs.test.ts)
 *   a cascade failure never fails the decline or stops the cron
 *
 * Emails are mocks: nothing is sent anywhere.
 */

const NOW = new Date('2026-10-01T15:00:00.000Z')
const HOUR = 60 * 60 * 1000

const state = vi.hoisted(() => ({
  q: undefined as unknown as QuartetFixture,
  conflicted: new Set<string>(),
  noEmail: new Set<string>(),
  /** Both violin chairs draw on one pool (v1's players, then v2's), as the real ranking does by instrument. */
  sharedViolins: false,
  /** Make the candidate lookup fail, as a database read error does in strict mode. */
  candidatesError: null as Error | null,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => state.q.db,
  getOrgAdminEmails: vi.fn(async () => ['admin@example.com', 'owner@example.com']),
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

vi.mock('@/lib/email/log', () => ({ hasRecentFailure: async () => false, logEmail: vi.fn(async () => {}) }))
vi.mock('@/lib/email/client', () => ({ logEmailConfig: vi.fn() }))
vi.mock('@/lib/venue-attach', () => ({ attachVenueDetails: vi.fn(async () => {}) }))

/**
 * Stands in for the ranking engine, with its rules: everyone ranked for the
 * chair who is not seated on the gig, not holding an active offer on it, and
 * has not had their turn at this chair, best first; state.conflicted marks
 * clashes. "Active" is deadline-aware (a lapsed pending offer holds nobody),
 * except with { forCascade: true }, where any pending, viewed or accepted
 * offer counts, as cascade_offer counts it. Strict reads throw
 * state.candidatesError.
 */
vi.mock('@/lib/staffing/candidates', () => ({
  getNextCandidates: vi.fn(async (_db: unknown, positionId: string, _limit?: number, options: { forCascade?: boolean } = {}) => {
    if (state.candidatesError) {
      if (options.forCascade) throw state.candidatesError
      return { candidates: [], totalAvailable: 0 }
    }
    const q = state.q
    const key = (Object.keys(QUARTET_CHAIRS) as ChairKey[]).find((k) => QUARTET_CHAIRS[k].id === positionId)!
    const t = q.db.tables
    const now = Date.now()
    const seated = new Set(t.project_positions.map((p) => p.musician_id).filter(Boolean))
    const holds = (o: Row) =>
      o.status === 'accepted' ||
      (['pending', 'viewed'].includes(o.status) && (options.forCascade || !o.expires_at || new Date(o.expires_at).getTime() >= now))
    const busy = new Set(t.contract_offers.filter(holds).map((o) => o.musician_id))
    const tried = new Set(
      q.offers(key).filter((o) => ['declined', 'expired', 'superseded', 'rescinded', 'released'].includes(o.status)).map((o) => o.musician_id)
    )
    const pool = state.sharedViolins && (key === 'v1' || key === 'v2') ? [...QUARTET_RANKING.v1, ...QUARTET_RANKING.v2] : QUARTET_RANKING[key]
    const candidates = pool
      .filter((id) => !seated.has(id) && !busy.has(id) && !tried.has(id))
      .map((id) => q.db.row('musicians', id)!)
      .filter((m) => m.is_active !== false)
      .map((m) => ({
        id: m.id,
        first_name: m.first_name,
        last_name: m.last_name,
        email: state.noEmail.has(m.id) ? '' : m.email,
        call_order: m.call_order,
        is_leader: m.is_leader,
        has_conflict: state.conflicted.has(m.id),
        conflict_reason: state.conflicted.has(m.id) ? 'Booked elsewhere' : null,
      }))
      .sort((a, b) => Number(a.has_conflict) - Number(b.has_conflict))
    return { candidates, totalAvailable: candidates.filter((c) => !c.has_conflict).length }
  }),
}))

import { POST as declinePOST } from '@/app/api/gig/[token]/decline/route'
import { GET as expireGET } from '@/app/api/cron/expire-offers/route'
import { advance, autoOfferNote, rankForCascade, cascadeTerms, planCascade } from '@/lib/staffing/cascade'
import { cascadeExpiresAt, CASCADE_MIN_LEAD_MS } from '@/lib/staffing/expiry'
import * as email from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { AdminOfferResponseEmail } from '@/lib/email/templates/admin-offer-response'
import { OfferExpiredEmail } from '@/lib/email/templates/offer-expired'
import { CascadeExhaustedEmail } from '@/lib/email/templates/cascade-exhausted'
import { resolveVertical } from '@/lib/verticals'

const R = QUARTET_RANKING
const q = () => state.q
let errorSpy: MockInstance

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  process.env.CRON_SECRET = 'test-secret'
  delete process.env.CRON_ENABLED
  state.conflicted = new Set()
  state.noEmail = new Set()
  state.sharedViolins = false
  state.candidatesError = null
  state.q = buildQuartet()
  state.q.db.constraint = cascadeConstraints
  state.q.db.tables.organizations = [{ ...QUARTET_ORG, auto_cascade: true, allow_worker_drop: false }]
  for (const p of state.q.db.tables.project_positions) p.auto_cascade_disabled = false
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------

const post = (url: string) => new Request(`http://localhost:3000${url}`, { method: 'POST' })
const cronRequest = () =>
  new NextRequest('http://localhost:3000/api/cron/expire-offers', { headers: { authorization: 'Bearer test-secret' } })

/** An admin's offer as createOffer leaves it, with a recorded leader-fee choice. */
function adminOffer(key: ChairKey, musicianId: string, opts: { customPay?: number | null; windowHours?: number; leaderFee?: boolean } = {}): Row {
  const sentAt = new Date(Date.now() - HOUR)
  const row = q().sendOffer(key, musicianId, {
    customPay: opts.customPay ?? null,
    expiresAt: new Date(sentAt.getTime() + (opts.windowHours ?? 48) * HOUR).toISOString(),
  })
  row.sent_at = sentAt.toISOString()
  row.terms_snapshot = {
    pay: { custom_pay: opts.customPay ?? null, include_leader_fee: opts.leaderFee ?? false, leader_fee_amount: opts.leaderFee ? 50 : null },
  }
  q().hydrate()
  return row
}

async function decline(row: Row) {
  q().hydrate()
  const res = await declinePOST(post(`/api/gig/${row.token}/decline`), { params: Promise.resolve({ token: row.token as string }) })
  expect(res.status).toBeLessThan(400)
}

async function runCron() {
  q().hydrate()
  return (await expireGET(cronRequest())).json()
}

const cascadedFrom = (offerId: string) => q().db.tables.contract_offers.filter((o) => o.cascaded_from_offer_id === offerId)
const calls = (fn: unknown) => vi.mocked(fn as (...a: unknown[]) => unknown).mock.calls.map((c) => c[0] as Record<string, unknown>)
const events = (action: string) => (q().db.tables.staffing_events ?? []).filter((e) => e.action === action)

// ---------------------------------------------------------------------------

describe('decline -> the next person is offered automatically', () => {
  it('offers the chair to the next on the list, on the ended offer\'s terms, and tells the admins', async () => {
    const first = adminOffer('v2', R.v2[0], { customPay: 275, windowHours: 24, leaderFee: true })
    await decline(first)

    expect(q().db.row('contract_offers', first.id)!.status).toBe('declined')
    const [next] = cascadedFrom(first.id)
    expect(next).toMatchObject({
      musician_id: R.v2[1],
      status: 'pending',
      custom_pay: 275,
      created_by: null,
      delivery_status: 'sent',
      // The same 24-hour window, starting now.
      expires_at: new Date(NOW.getTime() + 24 * HOUR).toISOString(),
    })
    expect(next.terms_snapshot).toMatchObject({
      pay: { custom_pay: 275, include_leader_fee: true, leader_fee_amount: 50 },
      cascade: { from_offer_id: first.id, trigger: 'declined' },
    })
    expect(q().chair('v2')).toMatchObject({ status: 'offered', musician_id: null })

    // The offer email, with the copied pay and leader-fee choice.
    const offerMails = calls(email.sendContractOfferEmail)
    expect(offerMails).toHaveLength(1)
    expect(offerMails[0]).toMatchObject({ to: `${R.v2[1]}@example.com`, payAmount: 275, isLeader: true, leaderFee: 50 })

    // The admins' decline notice says what Podium did.
    const [notice] = calls(email.sendAdminOfferResponseEmail)
    expect(notice.status).toBe('declined')
    expect(notice.autoOffer).toEqual({
      kind: 'offered',
      musicianName: 'V2B Player',
      expiresAt: next.expires_at,
      timezone: QUARTET_ORG.timezone,
    })

    // History: the decline, then the automatic offer, as the system.
    expect(events('offer.declined')).toHaveLength(1)
    expect(events('cascade.offered')).toEqual([
      expect.objectContaining({ actor_type: 'system', entity_id: next.id, after: expect.objectContaining({ trigger_offer_id: first.id }) }),
    ])
    expect(events('offer.sent')).toEqual([expect.objectContaining({ actor_type: 'system', entity_id: next.id })])
    expect(events('cascade.skipped')).toHaveLength(0)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('keeps going down the list as each one declines, then emails the admins once when nobody is left', async () => {
    const first = adminOffer('cello', R.cello[0])
    await decline(first)
    const second = cascadedFrom(first.id)[0]
    expect(second.musician_id).toBe(R.cello[1])

    await decline(second)
    const third = cascadedFrom(second.id)[0]
    expect(third.musician_id).toBe(R.cello[2])

    await decline(third)
    expect(cascadedFrom(third.id)).toHaveLength(0)
    expect(q().chair('cello')).toMatchObject({ status: 'vacant', musician_id: null })

    expect(calls(email.sendCascadeExhaustedEmail)).toEqual([
      expect.objectContaining({
        to: ['admin@example.com', 'owner@example.com'],
        projectName: 'Smith Wedding',
        instrument: 'Cello',
        lastMusicianName: 'CELLOC Player',
        lastOutcome: 'declined',
      }),
    ])
    expect(vi.mocked(logEmail).mock.calls.filter((c) => c[0].emailType === 'cascade_exhausted')).toEqual([
      [expect.objectContaining({ recipientEmail: 'admin@example.com', offerId: third.id, metadata: expect.objectContaining({ allRecipients: ['admin@example.com', 'owner@example.com'] }) })],
    ])
    expect(q().db.row('contract_offers', third.id)!.cascade_exhausted_at).toBeTruthy()
    expect(events('cascade.exhausted')).toHaveLength(1)
    expect(calls(email.sendAdminOfferResponseEmail).at(-1)!.autoOffer).toEqual({ kind: 'exhausted' })

    // Asked again about the same ended offer (a second cron, a retry): no second email.
    const again = await advance(q().db as never, { positionId: QUARTET_CHAIRS.cello.id, triggerOfferId: third.id, trigger: 'declined' })
    expect(again).toEqual({ outcome: 'skipped', reason: 'already_exhausted' })
    expect(calls(email.sendCascadeExhaustedEmail)).toHaveLength(1)
  })

  it('passes over a musician with a conflict', async () => {
    state.conflicted.add(R.viola[1])
    const first = adminOffer('viola', R.viola[0])
    await decline(first)
    expect(cascadedFrom(first.id).map((o) => o.musician_id)).toEqual([R.viola[2]])
    expect(events('offer.sent')[0].after.skipped_conflicts).toBe(1)
  })

  it('a conflicted musician is never offered: with only conflicts left, the list counts as exhausted', async () => {
    state.conflicted.add(R.viola[1]).add(R.viola[2])
    const first = adminOffer('viola', R.viola[0])
    await decline(first)
    expect(cascadedFrom(first.id)).toHaveLength(0)
    expect(calls(email.sendCascadeExhaustedEmail)).toHaveLength(1)
  })

  it('passes over a musician with no email address (they would never hear of it)', async () => {
    state.noEmail.add(R.viola[1])
    const first = adminOffer('viola', R.viola[0])
    await decline(first)
    expect(cascadedFrom(first.id).map((o) => o.musician_id)).toEqual([R.viola[2]])
  })

  it('"nobody left" names whoever is free but has no email, and the history records who was passed over', async () => {
    state.noEmail.add(R.viola[1])
    state.conflicted.add(R.viola[2])
    const first = adminOffer('viola', R.viola[0])
    await decline(first)

    expect(cascadedFrom(first.id)).toHaveLength(0)
    expect(calls(email.sendCascadeExhaustedEmail)).toEqual([expect.objectContaining({ noEmailNames: ['VIOLAB Player'] })])
    expect(events('cascade.exhausted')).toEqual([
      expect.objectContaining({
        after: expect.objectContaining({ position_id: QUARTET_CHAIRS.viola.id, skipped_conflicts: 1, skipped_no_email: [R.viola[1]] }),
      }),
    ])
  })
})

describe('expiry -> the next person is offered automatically', () => {
  it('the cron expires the offer, offers the next on the list, and the admin notice says so', async () => {
    const lapsed = adminOffer('viola', R.viola[0], { windowHours: 0.5 })
    expect(new Date(lapsed.expires_at).getTime()).toBeLessThan(Date.now())

    const out = await runCron()
    expect(out).toMatchObject({ expired: 1, autoOffered: 1 })
    expect(q().db.row('contract_offers', lapsed.id)!.status).toBe('expired')

    const [next] = cascadedFrom(lapsed.id)
    expect(next).toMatchObject({ musician_id: R.viola[1], status: 'pending' })
    // Same 30-minute window, from now.
    expect(next.expires_at).toBe(new Date(NOW.getTime() + 0.5 * HOUR).toISOString())

    const [notice] = calls(email.sendOfferExpiredEmail)
    expect(notice.nextCandidate).toBeNull()
    expect(notice.autoOffer).toMatchObject({ kind: 'offered', musicianName: 'VIOLAB Player' })
    expect(calls(email.sendContractOfferEmail).map((m) => m.to)).toEqual([`${R.viola[1]}@example.com`])

    // The expiry is recorded before the automatic offer.
    const order = q().db.tables.staffing_events.map((e) => e.action)
    expect(order.indexOf('offer.expired')).toBeLessThan(order.indexOf('cascade.offered'))
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('a second cron run does not offer the chair again', async () => {
    const lapsed = adminOffer('viola', R.viola[0], { windowHours: 0.5 })
    await runCron()
    await runCron()
    expect(cascadedFrom(lapsed.id)).toHaveLength(1)
    expect(calls(email.sendContractOfferEmail)).toHaveLength(1)
  })

  it('caps the new deadline at the gig\'s first service start', async () => {
    const lapsed = adminOffer('viola', R.viola[0], { windowHours: 0.5 })
    lapsed.sent_at = new Date(Date.now() - 400 * 24 * HOUR).toISOString() // a 400-day window
    await runCron()
    expect(cascadedFrom(lapsed.id)[0].expires_at).toBe(new Date(QUARTET_SERVICES[0].start_time).toISOString())
  })

  it('two chairs of one instrument lapsing in the same run are both offered on (no one is chosen twice)', async () => {
    // One violin pool for both chairs, in call order: v1's players, then v2's.
    state.sharedViolins = true
    const pool = [...R.v1, ...R.v2]
    pool.forEach((id, i) => (q().db.row('musicians', id)!.call_order = i + 1))
    // Chair 1 to the first on the list, chair 2 to the second, same deadline.
    const x = adminOffer('v1', pool[0], { windowHours: 0.5 })
    const y = adminOffer('v2', pool[1], { windowHours: 0.5 })

    const out = await runCron()
    expect(out).toMatchObject({ expired: 2, autoOffered: 2 })
    // Chair 1 expires first. The second on the list is still 'pending' on chair 2
    // (lapsed, not yet collected), which cascade_offer refuses, so the planner
    // leaves them out too and goes straight to the third.
    expect(cascadedFrom(x.id).map((o) => o.musician_id)).toEqual([pool[2]])
    // Chair 2: the third is now asked for chair 1; the first's turn was at chair 1,
    // not chair 2, so they are next here (the same rule the admin's list uses).
    expect(cascadedFrom(y.id).map((o) => o.musician_id)).toEqual([pool[0]])
    expect(events('cascade.skipped')).toHaveLength(0)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('a failure on one chair does not stop the run for the others', async () => {
    adminOffer('viola', R.viola[0], { windowHours: 0.5 })
    adminOffer('cello', R.cello[0], { windowHours: 0.5 })
    const real = q().db.rpcs.cascade_offer
    let first = true
    q().db.rpcs.cascade_offer = (db, args) => {
      if (first) {
        first = false
        throw new MockPgError('connection reset', '08006')
      }
      return real(db, args)
    }

    const out = await runCron()
    expect(out).toMatchObject({ expired: 2, autoOffered: 1, emailsSent: 2 })
    expect(q().liveOffers('viola')).toHaveLength(0)
    expect(q().liveOffers('cello').map((o) => o.musician_id)).toEqual([R.cello[1]])
    // The failed chair's notice is the ordinary one (with who is next), since Podium did nothing.
    const notices = calls(email.sendOfferExpiredEmail)
    expect(notices[0].autoOffer).toBeUndefined()
    expect(notices[0].nextCandidate).toMatchObject({ email: `${R.viola[1]}@example.com` })
    expect(events('cascade.skipped')).toEqual([expect.objectContaining({ after: expect.objectContaining({ reason: 'error' }) })])
  })
})

describe('nothing happens when', () => {
  async function declineAndExpectNothing(row: Row) {
    await decline(row)
    expect(q().db.row('contract_offers', row.id)!.status).toBe('declined')
    expect(cascadedFrom(row.id)).toHaveLength(0)
    expect(calls(email.sendContractOfferEmail)).toHaveLength(0)
    expect(calls(email.sendCascadeExhaustedEmail)).toHaveLength(0)
    expect(calls(email.sendAdminOfferResponseEmail)[0].autoOffer).toBeUndefined()
  }

  it('the organization has auto-offer off (and nothing is logged about it)', async () => {
    q().db.tables.organizations[0].auto_cascade = false
    await declineAndExpectNothing(adminOffer('v2', R.v2[0]))
    expect(events('cascade.skipped')).toHaveLength(0)
  })

  it('the chair is switched out of auto-offer', async () => {
    q().chair('v2').auto_cascade_disabled = true
    await declineAndExpectNothing(adminOffer('v2', R.v2[0]))
    expect(events('cascade.skipped').map((e) => e.after.reason)).toEqual(['chair_opted_out'])
  })

  it('the offer was a substitute\'s (the chair is still the original musician\'s)', async () => {
    const original = adminOffer('viola', R.viola[0])
    original.status = 'accepted'
    q().chair('viola').musician_id = R.viola[0]
    q().chair('viola').status = 'confirmed'
    const subOffer = q().sendOffer('viola', R.viola[1], { supersede: false })
    subOffer.is_substitution = true
    q().db.tables.substitution_requests.push({
      id: 'sub-1',
      offer_id: subOffer.id,
      status: 'approved',
      requesting_musician_id: R.viola[0],
      project_position_id: QUARTET_CHAIRS.viola.id,
    })
    q().hydrate()
    await decline(subOffer)
    expect(cascadedFrom(subOffer.id)).toHaveLength(0)
    expect(events('cascade.skipped')).toHaveLength(0)
    expect(q().chair('viola').musician_id).toBe(R.viola[0])
  })

  it.each([
    ['the chair is filled', (row: Row) => { q().chair('v2').musician_id = R.v2[2]; q().chair('v2').status = 'confirmed'; return row }, 'chair_filled'],
    ['the gig is cancelled', (row: Row) => { q().db.tables.projects[0].status = 'cancelled'; return row }, 'gig_closed'],
    ['the gig is completed', (row: Row) => { q().db.tables.projects[0].status = 'completed'; return row }, 'gig_closed'],
    ['the gig is a draft', (row: Row) => { q().db.tables.projects[0].status = 'draft'; return row }, 'gig_not_active'],
    ['someone else is already being asked', (row: Row) => { q().sendOffer('v2', R.v2[2], { supersede: false }); return row }, 'chair_has_live_offer'],
    ['the gig has started', (row: Row) => { for (const s of q().db.tables.services) s.start_time = new Date(Date.now() - HOUR).toISOString(); q().hydrate(); return row }, 'no_time_left'],
    ['the offer is not over', (row: Row) => { row.status = 'pending'; return row }, 'trigger_not_ended'],
  ])('%s', async (_label, arrange, reason) => {
    const row = adminOffer('v2', R.v2[0])
    row.status = 'declined'
    arrange(row)
    const result = await advance(q().db as never, { positionId: QUARTET_CHAIRS.v2.id, triggerOfferId: row.id, trigger: 'declined' })
    expect(result).toEqual({ outcome: 'skipped', reason })
    expect(cascadedFrom(row.id)).toHaveLength(0)
    expect(calls(email.sendContractOfferEmail)).toHaveLength(0)
    expect(calls(email.sendCascadeExhaustedEmail)).toHaveLength(0)
    expect(events('cascade.skipped').map((e) => e.after.reason)).toEqual([reason])
  })
})

describe('exactly one automatic offer per ended offer', () => {
  it('two runs at once for the same declined offer make one offer and send one email', async () => {
    const row = adminOffer('v2', R.v2[0])
    row.status = 'declined'
    const input = { positionId: QUARTET_CHAIRS.v2.id, triggerOfferId: row.id, trigger: 'declined' as const }
    const [a, b] = await Promise.all([advance(q().db as never, input), advance(q().db as never, input)])

    expect([a.outcome, b.outcome].sort()).toEqual(['offered', 'skipped'])
    expect(cascadedFrom(row.id)).toHaveLength(1)
    expect(calls(email.sendContractOfferEmail)).toHaveLength(1)
  })

  it('a decline racing the cron on the same chair: one automatic offer, one email', async () => {
    // The old two-offers-on-one-chair state (before createOffer): one musician
    // declines while the cron expires the other's lapsed offer, at the same time.
    const declining = adminOffer('v2', R.v2[0])
    const lapsed = q().sendOffer('v2', R.v2[1], { supersede: false, expiresAt: new Date(Date.now() - HOUR).toISOString() })

    await Promise.all([decline(declining), runCron()])

    expect(q().db.row('contract_offers', declining.id)!.status).toBe('declined')
    expect(q().db.row('contract_offers', lapsed.id)!.status).toBe('expired')
    expect(q().db.tables.contract_offers.filter((o) => o.cascaded_from_offer_id)).toHaveLength(1)
    expect(q().liveOffers('v2').map((o) => o.musician_id)).toEqual([R.v2[2]])
    expect(calls(email.sendContractOfferEmail)).toHaveLength(1)
  })

  it('a database refusal of the duplicate (unique index) reads as already cascaded', async () => {
    const row = adminOffer('v2', R.v2[0])
    row.status = 'declined'
    q().db.rpcs.cascade_offer = () => {
      throw new MockPgError('duplicate key value violates unique constraint "contract_offers_one_cascade_per_trigger"', '23505')
    }
    const result = await advance(q().db as never, { positionId: QUARTET_CHAIRS.v2.id, triggerOfferId: row.id, trigger: 'declined' })
    expect(result).toEqual({ outcome: 'skipped', reason: 'already_cascaded' })
    expect(calls(email.sendContractOfferEmail)).toHaveLength(0)
  })
})

describe('a cascade failure never touches the musician\'s decline', () => {
  it('cascade_offer throws: the decline stands, the admins get the ordinary notice', async () => {
    q().db.rpcs.cascade_offer = () => {
      throw new MockPgError('canceling statement due to statement timeout', '57014')
    }
    const row = adminOffer('v2', R.v2[0])
    await decline(row)

    expect(q().db.row('contract_offers', row.id)!.status).toBe('declined')
    expect(q().chair('v2')).toMatchObject({ status: 'vacant', musician_id: null })
    expect(calls(email.sendOfferDeclinedEmail)).toHaveLength(1)
    expect(calls(email.sendAdminOfferResponseEmail)[0].autoOffer).toBeUndefined()
    expect(events('cascade.skipped')).toEqual([expect.objectContaining({ after: expect.objectContaining({ reason: 'error' }) })])
    expect(errorSpy).toHaveBeenCalled()
  })

  it('096 not applied (no cascade functions): nothing happens, the decline stands', async () => {
    delete q().db.rpcs.cascade_offer
    const row = adminOffer('v2', R.v2[0])
    await decline(row)
    expect(q().db.row('contract_offers', row.id)!.status).toBe('declined')
    expect(cascadedFrom(row.id)).toHaveLength(0)
    expect(errorSpy.mock.calls.some((c) => /migration 096/.test(String(c[0])))).toBe(true)
  })

  it('the next musician\'s email fails: the offer stands and the admins are told to follow up', async () => {
    vi.mocked(email.sendContractOfferEmail).mockRejectedValueOnce(new Error('Resend is down'))
    const row = adminOffer('v2', R.v2[0])
    await decline(row)
    const [next] = cascadedFrom(row.id)
    expect(next).toMatchObject({ status: 'pending', delivery_status: 'failed' })
    expect(calls(email.sendAdminOfferResponseEmail)[0].autoOffer).toMatchObject({ kind: 'offered', emailFailed: true })
  })

  it('the musician chosen was just offered another chair on the gig: Podium asks the next one', async () => {
    const row = adminOffer('v2', R.v2[0])
    row.status = 'declined'
    const real = q().db.rpcs.cascade_offer
    let raced = false
    q().db.rpcs.cascade_offer = (db, args: { p_musician_id: string }) => {
      if (!raced) {
        raced = true
        // R.v2[1] took an offer on the viola chair a moment ago.
        q().sendOffer('viola', args.p_musician_id, { supersede: false })
      }
      return real(db, args as never)
    }
    const result = await advance(q().db as never, { positionId: QUARTET_CHAIRS.v2.id, triggerOfferId: row.id, trigger: 'declined' })
    expect(result).toMatchObject({ outcome: 'offered', musician: { id: R.v2[2] } })
  })

  it('a musician the database refuses is not chosen again: Podium moves down the list', async () => {
    const row = adminOffer('v2', R.v2[0])
    row.status = 'declined'
    const real = q().db.rpcs.cascade_offer
    const tried: string[] = []
    // The database keeps refusing R.v2[1] (say, booked elsewhere since the plan was read).
    q().db.rpcs.cascade_offer = (db, args: { p_musician_id: string }) => {
      tried.push(args.p_musician_id)
      return args.p_musician_id === R.v2[1] ? { result: 'musician_has_conflict' } : real(db, args as never)
    }
    const result = await advance(q().db as never, { positionId: QUARTET_CHAIRS.v2.id, triggerOfferId: row.id, trigger: 'declined' })
    expect(result).toMatchObject({ outcome: 'offered', musician: { id: R.v2[2] } })
    expect(tried).toEqual([R.v2[1], R.v2[2]])
  })

  it('everyone left is refused by the database: the list counts as exhausted, not an error', async () => {
    const row = adminOffer('v2', R.v2[0])
    row.status = 'declined'
    q().db.rpcs.cascade_offer = () => ({ result: 'musician_had_turn' })
    const result = await advance(q().db as never, { positionId: QUARTET_CHAIRS.v2.id, triggerOfferId: row.id, trigger: 'declined' })
    expect(result).toEqual({ outcome: 'exhausted', notified: true })
    expect(calls(email.sendCascadeExhaustedEmail)).toHaveLength(1)
  })

  it('the candidate list cannot be read: nothing is marked exhausted and nobody is told "nobody left"', async () => {
    state.candidatesError = new Error('upstream request timeout (504)')
    const markExhausted = vi.spyOn(q().db.rpcs, 'mark_cascade_exhausted')
    const row = adminOffer('v2', R.v2[0])
    await decline(row)

    expect(q().db.row('contract_offers', row.id)!.status).toBe('declined')
    expect(q().db.row('contract_offers', row.id)!.cascade_exhausted_at).toBeFalsy()
    expect(markExhausted).not.toHaveBeenCalled()
    expect(calls(email.sendCascadeExhaustedEmail)).toHaveLength(0)
    expect(calls(email.sendContractOfferEmail)).toHaveLength(0)
    // The admins get the ordinary decline notice, and the failure is in the history.
    expect(calls(email.sendAdminOfferResponseEmail)[0].autoOffer).toBeUndefined()
    expect(events('cascade.skipped')).toEqual([
      expect.objectContaining({ after: expect.objectContaining({ reason: 'error', detail: 'upstream request timeout (504)' }) }),
    ])
    // Not stranded: once the read works, the same ended offer still cascades.
    state.candidatesError = null
    const retry = await advance(q().db as never, { positionId: QUARTET_CHAIRS.v2.id, triggerOfferId: row.id, trigger: 'declined' })
    expect(retry).toMatchObject({ outcome: 'offered', musician: { id: R.v2[1] } })
  })
})

// ---------------------------------------------------------------------------
// The rules, one at a time
// ---------------------------------------------------------------------------

describe('rankForCascade: call order only, never "can lead"', () => {
  const c = (id: string, call_order: number | null, extra: Record<string, unknown> = {}) => ({
    id,
    first_name: id,
    last_name: 'Player',
    email: `${id}@example.com`,
    call_order,
    is_leader: false,
    has_conflict: false,
    ...extra,
  })

  it('ignores is_leader, even on chair 1 where the suggestions list puts leaders first', () => {
    const list = [c('leader', 5, { is_leader: true }), c('first-on-list', 1)]
    expect(rankForCascade(list).next!.id).toBe('first-on-list')
  })

  it('breaks a tie in call order by name, not by the order it was given', () => {
    const list = [c('b', 2, { last_name: 'Zed', is_leader: true }), c('a', 2, { last_name: 'Abe' })]
    expect(rankForCascade(list).next!.id).toBe('a')
  })

  it('skips conflicts and people with no address; no call order goes last', () => {
    const list = [c('busy', 1, { has_conflict: true }), c('silent', 2, { email: '' }), c('unranked', null), c('ok', 9)]
    expect(rankForCascade(list)).toEqual({
      next: expect.objectContaining({ id: 'ok' }),
      skippedConflicts: 1,
      unreachable: [expect.objectContaining({ id: 'silent' })],
    })
    expect(rankForCascade([c('busy', 1, { has_conflict: true })]).next).toBeNull()
  })

  it('leaves out musicians the database already refused in this run', () => {
    const list = [c('refused', 1), c('next', 2), c('busy', 3, { has_conflict: true })]
    expect(rankForCascade(list, ['refused'])).toEqual({ next: expect.objectContaining({ id: 'next' }), skippedConflicts: 1, unreachable: [] })
    expect(rankForCascade(list, ['refused', 'next']).next).toBeNull()
  })
})

describe('cascadeTerms and cascadeExpiresAt', () => {
  it('copies the whole-gig fee and the recorded leader-fee choice', () => {
    expect(cascadeTerms({ custom_pay: '300.00', terms_snapshot: { pay: { include_leader_fee: true, leader_fee_amount: 50 } } })).toEqual({
      customPay: 300,
      includeLeaderFee: true,
      leaderFeeAmount: 50,
    })
    expect(cascadeTerms({ custom_pay: null, terms_snapshot: { pay: { include_leader_fee: false, leader_fee_amount: 50 } } })).toEqual({
      customPay: null,
      includeLeaderFee: false,
      leaderFeeAmount: null,
    })
    // No recorded choice (an offer from before 093): the email's own default applies, as it did.
    expect(cascadeTerms({ custom_pay: null, terms_snapshot: null })).toEqual({ customPay: null, includeLeaderFee: null, leaderFeeAmount: null })
  })

  const now = NOW.getTime()
  const gig = ['2026-11-07T21:00:00Z', '2026-11-07T22:30:00Z']

  it('the same window, from now', () => {
    const ended = { sent_at: new Date(now - 10 * HOUR).toISOString(), expires_at: new Date(now - 6 * HOUR).toISOString() }
    expect(cascadeExpiresAt(ended, gig, now)).toBe(new Date(now + 4 * HOUR).toISOString())
  })

  it('48 hours when the window is unknown (no deadline, no send time)', () => {
    expect(cascadeExpiresAt({ sent_at: null, expires_at: null }, gig, now)).toBe(new Date(now + 48 * HOUR).toISOString())
    expect(cascadeExpiresAt({ sent_at: new Date(now).toISOString(), expires_at: null }, gig, now)).toBe(new Date(now + 48 * HOUR).toISOString())
  })

  it('never past the first service start, and nothing once the gig has started', () => {
    const soon = [new Date(now + 2 * HOUR).toISOString(), new Date(now + 5 * HOUR).toISOString()]
    expect(cascadeExpiresAt({ sent_at: null, expires_at: null }, soon, now)).toBe(soon[0])
    const started = [new Date(now - HOUR).toISOString(), new Date(now + 5 * HOUR).toISOString()]
    expect(cascadeExpiresAt({ sent_at: null, expires_at: null }, started, now)).toBeNull()
    // Less than CASCADE_MIN_LEAD_MS (2 hours) to the downbeat: no offer nobody could act on.
    const imminent = [new Date(now + 2 * HOUR - 1).toISOString()]
    expect(cascadeExpiresAt({ sent_at: null, expires_at: null }, imminent, now)).toBeNull()
    expect(CASCADE_MIN_LEAD_MS).toBe(2 * HOUR)
    // A short window the admin chose is kept as it is, not refused.
    const halfHour = { sent_at: new Date(now - HOUR).toISOString(), expires_at: new Date(now - 0.5 * HOUR).toISOString() }
    expect(cascadeExpiresAt(halfHour, gig, now)).toBe(new Date(now + 0.5 * HOUR).toISOString())
    expect(cascadeExpiresAt({ sent_at: null, expires_at: null }, [], now)).toBe(new Date(now + 48 * HOUR).toISOString())
  })
})

describe('planCascade is read-only', () => {
  it('issues no insert, update, delete or function call', async () => {
    const row = adminOffer('v2', R.v2[0])
    row.status = 'declined'
    q().db.log = []
    const plan = await planCascade(q().db as never, { positionId: QUARTET_CHAIRS.v2.id, triggerOfferId: row.id })
    expect(plan).toMatchObject({ kind: 'offer', musician: { id: R.v2[1] } })
    expect(q().db.log.filter((e) => e.operation !== 'select')).toEqual([])
  })

  it('the preview can ask about a still-open offer in an organization with auto-offer off', async () => {
    q().db.tables.organizations[0].auto_cascade = false
    const open = adminOffer('v2', R.v2[0], { customPay: 250 })
    const input = { positionId: QUARTET_CHAIRS.v2.id, triggerOfferId: open.id }
    expect(await planCascade(q().db as never, input)).toMatchObject({ kind: 'skip', reason: 'auto_off' })
    expect(await planCascade(q().db as never, { ...input, assume: { autoCascadeOn: true } })).toMatchObject({
      kind: 'skip',
      reason: 'trigger_not_ended',
    })
    expect(await planCascade(q().db as never, { ...input, assume: { autoCascadeOn: true, triggerEnded: true } })).toMatchObject({
      kind: 'offer',
      musician: { id: R.v2[1] },
      terms: { customPay: 250 },
    })
  })
})

describe('autoOfferNote', () => {
  it('says nothing unless Podium acted', () => {
    expect(autoOfferNote(null)).toBeUndefined()
    expect(autoOfferNote({ outcome: 'skipped', reason: 'chair_opted_out' })).toBeUndefined()
    expect(autoOfferNote({ outcome: 'exhausted', notified: true })).toEqual({ kind: 'exhausted' })
  })
})

describe('what the admins read', () => {
  const base = {
    organizationName: 'Test Quartet Co',
    projectName: 'Smith Wedding',
    musicianName: 'V2A Player',
    instrument: 'Violin',
    chairNumber: 2,
    totalChairs: 2,
    dashboardUrl: 'https://app.example.com/dashboard/projects',
  }
  const offered = { kind: 'offered' as const, musicianName: 'V2B Player', expiresAt: '2026-10-02T15:00:00.000Z', timezone: 'America/Chicago' }

  it('decline notice: who it was offered to and until when, instead of "now vacant"', async () => {
    const html = await render(AdminOfferResponseEmail({ ...base, musicianEmail: null, status: 'declined', autoOffer: offered }))
    expect(html).toContain('Offered automatically')
    expect(html).toContain('V2B Player')
    expect(html).toContain('Friday, October 2 at 10:00 AM')
    expect(html).not.toContain('The position is now vacant')
  })

  it('expiry notice: says the list ran out instead of naming who is next', async () => {
    const html = await render(OfferExpiredEmail({ ...base, nextCandidate: null, autoOffer: { kind: 'exhausted' } }))
    expect(html).toContain('nobody left on it is free')
    expect(html).not.toContain('Visit the dashboard to send an offer')
  })

  it('a failed email to the next musician is called out', async () => {
    const html = await render(OfferExpiredEmail({ ...base, nextCandidate: null, autoOffer: { ...offered, emailFailed: true } }))
    expect(html).toContain('could not be sent')
  })

  it('the "nobody left" email uses the organization\'s words', async () => {
    const music = await render(
      CascadeExhaustedEmail({ ...base, lastMusicianName: 'V2C Player', lastOutcome: 'expired', performanceDate: 'Nov 7' })
    )
    expect(music).toContain('Violin, Chair 2')
    expect(music).toContain('did not answer in time')
    expect(music.replace(/<!-- -->/g, '')).toContain('your musicians')
    const theatre = await render(
      CascadeExhaustedEmail({ ...base, instrument: 'Ensemble', lastMusicianName: 'Pat', lastOutcome: 'dropped', terms: resolveVertical('theatre').terms })
    )
    expect(theatre).toContain('dropped out')
    expect(theatre).not.toContain('musician')
  })

  it('the "nobody left" email names people passed over for having no email address', async () => {
    const plain = await render(CascadeExhaustedEmail({ ...base, lastMusicianName: 'V2C Player', lastOutcome: 'declined' }))
    expect(plain).not.toContain('no email address')
    const one = (
      await render(CascadeExhaustedEmail({ ...base, lastMusicianName: 'V2C Player', lastOutcome: 'declined', noEmailNames: ['Pat Doe'] }))
    ).replace(/<!-- -->/g, '')
    expect(one).toContain('free and reachable by email')
    expect(one).toContain('Pat Doe</strong> is free but has no email address on file')
  })
})
