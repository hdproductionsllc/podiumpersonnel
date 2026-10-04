import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { buildQuartet, oneLiveOfferPerChair, QUARTET_RANKING, type QuartetFixture } from './helpers/quartet-fixture'
import type { Row } from './helpers/supabase-mock'
import { MockPgError } from './helpers/staffing-rpcs'

/**
 * POST /api/positions/[positionId]/offers → createOffer (src/lib/staffing/offers.ts),
 * the one server-side way an offer is made (target architecture PR 8).
 *
 * Driven against the quartet fixture with the real route, real createOffer and
 * the real offer-email module; only the email provider, the email log and the
 * venue lookup are stubbed. Covers: who may send, the refusals, what the offer
 * row records (093 columns), the expiry policy, retire-then-insert and the undo on a failed send, the
 * history rows, running before migration 093 is pasted, and that the offer
 * email is the same email the old send-email route sent.
 */

const state = vi.hoisted(() => ({
  q: undefined as unknown as QuartetFixture,
  user: null as unknown,
  sendOfferFails: false,
  suppress: false,
  /** When set, the admin session's read of the musician returns this instead. */
  musicianRead: null as null | { data: unknown; error: unknown },
}))

const ADMIN = { id: 'user-admin', email: 'admin@example.com' }

/** A select().eq().maybeSingle() chain that resolves to `result`. */
function stubbedRead(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.maybeSingle = async () => result
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => state.q.db,
  createClient: async () => ({
    from: (table: string) =>
      table === 'musicians' && state.musicianRead ? stubbedRead(state.musicianRead) : state.q.db.from(table),
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
  // The admins' copy of the musician's email (notify/copies.ts).
  sendEmail: vi.fn(async () => ({ id: 'admin-copy' })),
}))

vi.mock('@/lib/email/log', () => ({ hasRecentFailure: async () => false, logEmail: vi.fn(async () => {}) }))
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
  state.musicianRead = null
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
    // The admins get a marked copy of exactly that email, with its links off.
    const copies = mailCalls(email.sendEmail)
    expect(copies).toHaveLength(1)
    expect(copies[0][0]).toMatchObject({ to: ['admin@example.com'], subject: expect.stringMatching(/^Copy: Offer \(sent to /) })
    expect(logEmail).toHaveBeenCalledTimes(1)
  })

  it('records offer.created (in create_offer) then offer.sent with the delivery', async () => {
    const res = await offer('pos-v1', { musicianId: R.v1[0] })
    expect(events()).toEqual([
      expect.objectContaining({
        organization_id: 'org-quartet',
        actor_type: 'admin',
        actor_id: ADMIN.id,
        entity_id: res.body.offerId,
        action: 'offer.created',
        after: expect.objectContaining({ status: 'pending', position_id: 'pos-v1', musician_id: R.v1[0] }),
      }),
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
    // No copy of an email that never went out.
    expect(mailCalls(email.sendEmail)).toHaveLength(0)
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

  /** Move the gig's two services to these instants (relative to the real clock). */
  const servicesAt = (ceremony: number, cocktail: number) => {
    q().db.row('services', 'svc-ceremony')!.start_time = new Date(ceremony).toISOString()
    q().db.row('services', 'svc-cocktail')!.start_time = new Date(cocktail).toISOString()
    q().hydrate()
  }

  it('"No expiration" ends when the gig\'s first service starts (B1.2)', async () => {
    const ceremony = Date.now() + 72 * HOUR
    servicesAt(ceremony + 2 * HOUR, ceremony) // listed out of order on purpose
    const res = await offer('pos-v1', { musicianId: R.v1[0], expiry: { kind: 'none' } })
    expect(row(res.body.offerId).expires_at).toBe(new Date(ceremony).toISOString())
  })

  it('"No expiration" on a gig already under way ends at the next service still ahead', async () => {
    const cocktail = Date.now() + 2 * HOUR
    servicesAt(Date.now() - HOUR, cocktail)
    const res = await offer('pos-v1', { musicianId: R.v1[0], expiry: { kind: 'none' } })
    expect(row(res.body.offerId).expires_at).toBe(new Date(cocktail).toISOString())
  })

  it('"No expiration" with no service still ahead stores no deadline', async () => {
    servicesAt(Date.now() - 3 * HOUR, Date.now() - HOUR)
    expect(await span({ kind: 'none' })).toBeNull()
  })

  it('a deadline is never moved, even one after the gig starts', async () => {
    servicesAt(Date.now() + 2 * HOUR, Date.now() + 3 * HOUR)
    expect(Math.round((await span({ kind: 'hours', hours: 48 }))!)).toBe(48)
  })

  it('a custom date is stored as the instant the browser resolved', async () => {
    const at = '2026-11-01T04:59:59.000Z'
    const res = await offer('pos-v1', { musicianId: R.v1[0], expiry: { kind: 'until', at } })
    expect(row(res.body.offerId).expires_at).toBe(at)
  })
})

// ---------------------------------------------------------------------------

describe('replacing the previous offer', () => {
  it('marks the earlier open offer "superseded" before the new one is written, and records it', async () => {
    const anna = q().sendOffer('v1', R.v1[0])
    const res = await offer('pos-v1', { musicianId: R.v1[1] })

    expect(row(anna.id as string)).toMatchObject({ status: 'superseded' })
    expect(row(anna.id as string).responded_at).toBeTruthy()
    expect(res.body.superseded).toBe(1)
    expect(events().map((e: Row) => e.action)).toEqual(['offer.superseded', 'offer.created', 'offer.sent'])
    expect(events()[0]).toMatchObject({
      entity_id: anna.id,
      after: expect.objectContaining({ status: 'superseded', replaced_by: res.body.offerId, musician_id: R.v1[0] }),
    })
    // Retire and insert happen inside create_offer, one transaction; then the
    // email; then the delivery is recorded. Nothing else writes offers.
    const writes = q().db.log.filter(
      (e) => e.operation === 'rpc' || (e.table === 'contract_offers' && e.operation !== 'select')
    )
    expect(writes.map((e) => [e.table, e.operation])).toEqual([
      ['create_offer', 'rpc'],
      ['contract_offers', 'update'],
    ])
    expect(writes[0].payload).toMatchObject({
      p_position_id: 'pos-v1',
      p_musician_id: R.v1[1],
      p_created_by: ADMIN.id,
      p_delivery_status: 'queued',
      p_supersede: true,
    })
    expect(writes[1].payload).toEqual({ delivery_status: 'sent' })
    expect(mailCalls(email.sendContractOfferEmail)).toHaveLength(1)
  })

  it('leaves accepted, declined and expired offers on the chair alone', async () => {
    const declined = q().sendOffer('v1', R.v1[0])
    declined.status = 'declined'
    const res = await offer('pos-v1', { musicianId: R.v1[1] })
    expect(res.body.superseded).toBe(0)
    expect(row(declined.id as string).status).toBe('declined')
  })

  it('a failed send while someone else is waiting changes nothing, and the history says what happened', async () => {
    const anna = q().sendOffer('v1', R.v1[0])
    state.sendOfferFails = true

    const res = await offer('pos-v1', { musicianId: R.v1[1] })

    expect(res).toMatchObject({ status: 502, body: { code: 'send_failed' } })
    expect(res.body.error).toMatch(/could not be sent \(Resend is down\), so the offer was not created/)
    expect(row(anna.id as string)).toMatchObject({ status: 'pending', responded_at: null })
    expect(q().offers('v1')).toHaveLength(1)
    expect(events().map((e: Row) => [e.action, e.entity_id])).toEqual([
      ['offer.superseded', anna.id],
      ['offer.created', expect.any(String)],
      ['offer.withdrawn', expect.any(String)],
      ['offer.restored', anna.id],
    ])
    expect(events()[3].after).toMatchObject({ status: 'pending', musician_id: R.v1[0] })
  })

  it('a failed send keeps the chair on offer when the earlier offer comes back', async () => {
    q().sendOffer('v1', R.v1[0])
    state.sendOfferFails = true

    await offer('pos-v1', { musicianId: R.v1[1] })

    expect(q().chair('v1').status).toBe('offered')
  })

  it('puts a viewed offer back as viewed', async () => {
    const anna = q().sendOffer('v1', R.v1[0])
    anna.status = 'viewed'
    state.sendOfferFails = true

    const res = await offer('pos-v1', { musicianId: R.v1[1] })

    expect(res.status).toBe(502)
    expect(row(anna.id as string)).toMatchObject({ status: 'viewed', responded_at: null })
  })

  it('an earlier offer already past its deadline is not "waiting": a failed send keeps the new offer', async () => {
    const anna = q().sendOffer('v1', R.v1[0], { expiresAt: new Date(Date.now() - HOUR).toISOString() })
    state.sendOfferFails = true

    const res = await offer('pos-v1', { musicianId: R.v1[1] })

    expect(res).toMatchObject({ status: 200, body: { delivery: 'failed', emailError: 'Resend is down', superseded: 1 } })
    expect(row(anna.id as string).status).toBe('superseded')
    expect(row(res.body.offerId)).toMatchObject({ status: 'pending', delivery_status: 'failed' })
  })

  it("retires a substitute's open offer on the empty chair and closes its request; a failed send does not bring it back", async () => {
    const anna = q().sendOffer('v1', R.v1[0])
    const sub = q().sendOffer('v1', R.v1[2], { supersede: false })
    sub.is_substitution = true
    q().db.tables.substitution_requests.push({
      id: 'sub-req-1',
      project_position_id: 'pos-v1',
      requesting_musician_id: R.v2[0],
      status: 'approved',
      offer_id: sub.id,
    })
    state.sendOfferFails = true

    const res = await offer('pos-v1', { musicianId: R.v1[1] })

    expect(res).toMatchObject({ status: 502, body: { code: 'send_failed' } })
    expect(row(anna.id as string).status).toBe('pending')
    expect(row(sub.id as string).status).toBe('superseded')
    expect(q().db.row('substitution_requests', 'sub-req-1')!.status).toBe('cancelled')
    expect(events().filter((e: Row) => e.entity_id === 'sub-req-1')).toEqual([
      expect.objectContaining({
        action: 'substitution.ended',
        after: expect.objectContaining({ status: 'cancelled', reason: 'offer_superseded', offer_id: sub.id }),
      }),
    ])
    expect(events().filter((e: Row) => e.action === 'offer.restored').map((e: Row) => e.entity_id)).toEqual([anna.id])
  })
})

// ---------------------------------------------------------------------------

describe('the musician cannot be read', () => {
  it('a failed read refuses before anything is written: create_offer is not called, the chair is untouched', async () => {
    const anna = q().sendOffer('v1', R.v1[0])
    state.musicianRead = { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }

    const res = await offer('pos-v1', { musicianId: R.v1[1] })

    expect(res).toMatchObject({ status: 500, body: { code: 'failed' } })
    expect(q().db.log.filter((e) => e.operation === 'rpc')).toEqual([])
    expect(row(anna.id as string)).toMatchObject({ status: 'pending', responded_at: null })
    expect(q().offers('v1')).toHaveLength(1)
    expect(events()).toEqual([])
    expect(mailCalls(email.sendContractOfferEmail)).toHaveLength(0)
  })

  it('create_offer made the offer but the musician row came back empty: the offer is undone and the old one put back', async () => {
    const anna = q().sendOffer('v1', R.v1[0])
    state.musicianRead = { data: null, error: null }

    const res = await offer('pos-v1', { musicianId: R.v1[1] })

    expect(res).toMatchObject({ status: 500, body: { code: 'failed' } })
    expect(row(anna.id as string)).toMatchObject({ status: 'pending', responded_at: null })
    expect(q().offers('v1').map((o) => o.id)).toEqual([anna.id])
    expect(mailCalls(email.sendContractOfferEmail)).toHaveLength(0)
    expect(events().map((e: Row) => e.action)).toEqual(['offer.superseded', 'offer.created', 'offer.withdrawn', 'offer.restored'])
    expect(events()[2].after).toMatchObject({ reason: 'musician_unreadable' })
  })

  it('an undone offer on an empty chair puts the chair back to vacant', async () => {
    // create_offer marked the chair 'offered'; with its only offer undone it must
    // not keep reading as out on offer.
    state.musicianRead = { data: null, error: null }

    const res = await offer('pos-v1', { musicianId: R.v1[1] })

    expect(res.status).toBe(500)
    expect(q().offers('v1')).toHaveLength(0)
    expect(q().chair('v1')).toMatchObject({ status: 'vacant', musician_id: null })
  })
})

// ---------------------------------------------------------------------------

describe("under 095's one-live-offer-per-chair index", () => {
  beforeEach(() => {
    q().db.constraint = oneLiveOfferPerChair
  })

  it('replacing an open offer succeeds', async () => {
    const anna = q().sendOffer('v1', R.v1[0])

    const res = await offer('pos-v1', { musicianId: R.v1[1] })

    expect(res).toMatchObject({ status: 200, body: { delivery: 'sent', superseded: 1 } })
    expect(row(anna.id as string).status).toBe('superseded')
    expect(q().liveOffers('v1').map((o) => o.id)).toEqual([res.body.offerId])
  })

  it('a failed send still puts the previous offer back', async () => {
    const anna = q().sendOffer('v1', R.v1[0])
    state.sendOfferFails = true

    const res = await offer('pos-v1', { musicianId: R.v1[1] })

    expect(res.status).toBe(502)
    expect(q().liveOffers('v1').map((o) => o.id)).toEqual([anna.id])
  })

  it('create_offer refused by the index (another writer got there first): 409, nothing changed, no email', async () => {
    const anna = q().sendOffer('v1', R.v1[0])
    const real = q().db.rpcs.create_offer
    q().db.rpcs.create_offer = (db, args) => {
      // Whatever create_offer wrote before the refusal is rolled back with it.
      real(db, args)
      throw new MockPgError('duplicate key value violates unique constraint "contract_offers_one_live_per_position"', '23505')
    }

    const res = await offer('pos-v1', { musicianId: R.v1[1] })

    expect(res).toMatchObject({ status: 409, body: { code: 'chair_has_live_offer' } })
    expect(row(anna.id as string)).toMatchObject({ status: 'pending' })
    expect(q().offers('v1')).toHaveLength(1)
    expect(events()).toEqual([])
    expect(mailCalls(email.sendContractOfferEmail)).toHaveLength(0)
  })

  it("a put-back the index refuses (someone else's offer landed meanwhile) leaves theirs standing", async () => {
    const anna = q().sendOffer('v1', R.v1[0])
    state.sendOfferFails = true
    q().db.beforeOp = (entry, db) => {
      if (entry.table === 'contract_offers' && entry.operation === 'delete') {
        db.beforeOp = undefined
        db.tables.contract_offers.push({ id: 'offer-rival', project_position_id: 'pos-v1', musician_id: R.v1[2], status: 'pending' })
      }
    }

    const res = await offer('pos-v1', { musicianId: R.v1[1] })

    expect(res.status).toBe(502)
    expect(row(anna.id as string).status).toBe('superseded')
    expect(q().liveOffers('v1').map((o) => o.id)).toEqual(['offer-rival'])
    expect(events().map((e: Row) => e.action)).not.toContain('offer.restored')
  })
})

// ---------------------------------------------------------------------------

describe('before migration 094 is pasted (create_offer missing)', () => {
  it('refuses with 503, changes nothing, sends nothing, and says why in the logs', async () => {
    const anna = q().sendOffer('v1', R.v1[0])
    delete q().db.rpcs.create_offer

    const res = await offer('pos-v1', { musicianId: R.v1[1] })

    expect(res).toMatchObject({ status: 503, body: { code: 'not_ready' } })
    expect(row(anna.id as string).status).toBe('pending')
    expect(q().offers('v1')).toHaveLength(1)
    expect(q().chair('v1').status).toBe('offered')
    expect(mailCalls(email.sendContractOfferEmail)).toHaveLength(0)
    expect(vi.mocked(console.error).mock.calls.some((c) => /migration 094/.test(String(c[0])))).toBe(true)
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
    const copyViaRoute = mailCalls(email.sendEmail)[0][0]

    // Fresh gig, same musician and pay, the old way.
    state.q = buildQuartet()
    vi.clearAllMocks()
    await legacySend(key, musicianId, customPay, leader)
    const viaLegacy = mailCalls(email.sendContractOfferEmail)[0][0]
    const copyViaLegacy = mailCalls(email.sendEmail)[0][0]

    expect(normalise(viaRoute)).toEqual(normalise(viaLegacy))
    expect(normalise(copyViaRoute)).toEqual(normalise(copyViaLegacy))
  })
})
