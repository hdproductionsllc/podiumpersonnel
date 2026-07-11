import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import { NextRequest } from 'next/server'
import { MockSupabaseDb, type QueryLogEntry, type Row } from './helpers/supabase-mock'

/**
 * BEHAVIORAL tests for the offer-expiry cron (src/app/api/cron/expire-offers).
 *
 * These invoke the real exported GET handler against an in-memory Supabase
 * fake (see helpers/supabase-mock.ts). The invariants under test:
 *
 *   1. Requires `Authorization: Bearer ${CRON_SECRET}` — otherwise 401 and
 *      zero database activity.
 *   2. Honors CRON_ENABLED=false — skips with zero database activity.
 *   3. Expires ONLY offers in ['pending', 'viewed'] whose expires_at is in
 *      the past. Accepted offers (confirmed chairs) are never touched, nor
 *      are unexpired or already-resolved offers.
 *   4. Vacates a chair only when no other pending/viewed/ACCEPTED offer
 *      still holds the position — protecting the substitution flow where a
 *      sub's expired offer must not vacate the original musician's chair.
 */

const state = vi.hoisted(() => ({ db: undefined as any }))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => state.db,
  getOrgAdminEmails: vi.fn(async () => ['admin@example.com']),
}))

vi.mock('@/lib/email/send', () => ({
  formatPerformanceDateForSubject: vi.fn(() => 'Fri, Jul 10'),
  sendOfferExpiredEmail: vi.fn(async () => ({ id: 'em-expired', subject: 'Offer Expired', emailHtml: '<p>ok</p>' })),
  sendEmail: vi.fn(async () => ({ id: 'em-generic' })),
}))

vi.mock('@/lib/email/log', () => ({
  logEmail: vi.fn(async () => {}),
}))

vi.mock('@/lib/next-candidate', () => ({
  getNextCandidates: vi.fn(async () => ({ candidates: [], totalAvailable: 0 })),
}))

import { GET } from '@/app/api/cron/expire-offers/route'
import { sendOfferExpiredEmail } from '@/lib/email/send'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG = { id: 'org-1', name: 'Test Orchestra', timezone: 'America/Chicago' }
const INSTRUMENT = { id: 'inst-1', name: 'Violin' }

const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString()
const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString()

function makeCronOffer(over: Partial<Row> = {}): Row {
  const positionId = (over.project_position_id as string) ?? 'pos-1'
  return {
    id: 'offer-1',
    status: 'pending',
    project_position_id: positionId,
    expires_at: PAST,
    musician: { id: 'mus-1', first_name: 'Mia', last_name: 'Musician', email: 'mia@example.com' },
    project_position: {
      id: positionId,
      chair_number: 1,
      instrument_id: 'inst-1',
      instrument: INSTRUMENT,
      project: {
        id: 'proj-1',
        name: 'Fall Gala',
        organization_id: 'org-1',
        organization: ORG,
        services: [] as Row[],
      },
    },
    ...over,
  }
}

function makePosition(over: Partial<Row> = {}): Row {
  return {
    id: 'pos-1',
    project_id: 'proj-1',
    instrument_id: 'inst-1',
    chair_number: 1,
    musician_id: null,
    status: 'offered',
    ...over,
  }
}

function cronRequest(auth?: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/cron/expire-offers', {
    headers: auth ? { authorization: auth } : {},
  })
}

const ORIG_ENV = { ...process.env }
let errorSpy: MockInstance

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'test-secret'
  delete process.env.CRON_ENABLED
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  state.db = new MockSupabaseDb()
})

afterEach(() => {
  vi.restoreAllMocks()
  process.env = { ...ORIG_ENV }
})

// ---------------------------------------------------------------------------

describe('expire-offers cron — auth and kill switch', () => {
  it('rejects a request with no bearer token and touches nothing', async () => {
    const res = await GET(cronRequest())
    expect(res.status).toBe(401)
    expect(state.db.log).toHaveLength(0)
    expect(sendOfferExpiredEmail).not.toHaveBeenCalled()
  })

  it('rejects a wrong bearer token and touches nothing', async () => {
    const res = await GET(cronRequest('Bearer wrong-secret'))
    expect(res.status).toBe(401)
    expect(state.db.log).toHaveLength(0)
  })

  it('skips entirely when CRON_ENABLED=false', async () => {
    process.env.CRON_ENABLED = 'false'
    state.db = new MockSupabaseDb({
      contract_offers: [makeCronOffer()],
      project_positions: [makePosition()],
    })

    const res = await GET(cronRequest('Bearer test-secret'))
    const body = await res.json()

    expect(body.skipped).toBe(true)
    expect(state.db.log).toHaveLength(0)
    expect(state.db.row('contract_offers', 'offer-1')!.status).toBe('pending')
    expect(sendOfferExpiredEmail).not.toHaveBeenCalled()
  })
})

describe('expire-offers cron — expiry filter set', () => {
  it('expires only past-due pending/viewed offers — never accepted, future, or resolved ones', async () => {
    state.db = new MockSupabaseDb({
      contract_offers: [
        makeCronOffer({ id: 'offer-pending-past', status: 'pending', expires_at: PAST, project_position_id: 'pos-1' }),
        makeCronOffer({ id: 'offer-viewed-past', status: 'viewed', expires_at: PAST, project_position_id: 'pos-2' }),
        makeCronOffer({ id: 'offer-accepted-past', status: 'accepted', expires_at: PAST, project_position_id: 'pos-3' }),
        makeCronOffer({ id: 'offer-pending-future', status: 'pending', expires_at: FUTURE, project_position_id: 'pos-4' }),
        makeCronOffer({ id: 'offer-declined-past', status: 'declined', expires_at: PAST, project_position_id: 'pos-5' }),
        makeCronOffer({ id: 'offer-pending-noexpiry', status: 'pending', expires_at: null, project_position_id: 'pos-6' }),
      ],
      project_positions: [
        makePosition({ id: 'pos-1' }),
        makePosition({ id: 'pos-2' }),
        makePosition({ id: 'pos-3', musician_id: 'mus-1', status: 'confirmed' }),
        makePosition({ id: 'pos-4' }),
        makePosition({ id: 'pos-5' }),
        makePosition({ id: 'pos-6' }),
      ],
    })

    const res = await GET(cronRequest('Bearer test-secret'))
    const body = await res.json()

    expect(body.expired).toBe(2)

    expect(state.db.row('contract_offers', 'offer-pending-past')!.status).toBe('expired')
    expect(state.db.row('contract_offers', 'offer-viewed-past')!.status).toBe('expired')
    expect(state.db.row('contract_offers', 'offer-accepted-past')!.status).toBe('accepted')
    expect(state.db.row('contract_offers', 'offer-pending-future')!.status).toBe('pending')
    expect(state.db.row('contract_offers', 'offer-declined-past')!.status).toBe('declined')
    expect(state.db.row('contract_offers', 'offer-pending-noexpiry')!.status).toBe('pending')

    // The confirmed chair behind the accepted offer is untouched.
    const confirmedChair = state.db.row('project_positions', 'pos-3')!
    expect(confirmedChair.musician_id).toBe('mus-1')
    expect(confirmedChair.status).toBe('confirmed')

    // The fetch itself must carry the status/expiry filters (refactor guard).
    const fetch = state.db.ops('contract_offers', 'select')[0]
    expect(fetch.filters).toContainEqual({ method: 'in', args: ['status', ['pending', 'viewed']] })
    expect(fetch.filters).toContainEqual({ method: 'not', args: ['expires_at', 'is', null] })
    expect(fetch.filters.some((f: any) => f.method === 'lt' && f.args[0] === 'expires_at')).toBe(true)

    // Every offer update targeted one of the two legitimately expired offers.
    const offerUpdates = state.db.ops('contract_offers', 'update')
    expect(offerUpdates.length).toBeGreaterThan(0)
    for (const update of offerUpdates) {
      const idFilter = update.filters.find((f: any) => f.method === 'eq' && f.args[0] === 'id')
      expect(['offer-pending-past', 'offer-viewed-past']).toContain(idFilter?.args[1])
    }

    // Admins were notified once per expired offer.
    expect(sendOfferExpiredEmail).toHaveBeenCalledTimes(2)
    expect(body.emailsSent).toBe(2)
    expect(errorSpy).not.toHaveBeenCalled()
  }, 15000)

  it('returns expired: 0 and touches nothing when no offer qualifies', async () => {
    state.db = new MockSupabaseDb({
      contract_offers: [
        makeCronOffer({ id: 'offer-accepted-past', status: 'accepted', expires_at: PAST }),
        makeCronOffer({ id: 'offer-pending-future', status: 'pending', expires_at: FUTURE }),
      ],
      project_positions: [makePosition({ musician_id: 'mus-1', status: 'confirmed' })],
    })

    const res = await GET(cronRequest('Bearer test-secret'))
    const body = await res.json()

    expect(body.expired).toBe(0)
    expect(state.db.ops(undefined, 'update')).toHaveLength(0)
    expect(sendOfferExpiredEmail).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })
})

describe('expire-offers cron — accept/expiry race (optimistic lock)', () => {
  it('an offer accepted mid-run is left accepted and its confirmed chair is never vacated', async () => {
    state.db = new MockSupabaseDb({
      contract_offers: [makeCronOffer({ id: 'offer-racing', status: 'pending', expires_at: PAST })],
      project_positions: [makePosition({ id: 'pos-1' })],
    })
    // Simulate the musician accepting between the cron's fetch and its update:
    // flip the row the moment the expiry update begins, before filters apply.
    state.db.beforeOp = (entry: QueryLogEntry, db: MockSupabaseDb) => {
      if (entry.table === 'contract_offers' && entry.operation === 'update') {
        const offer = db.row('contract_offers', 'offer-racing')!
        if (offer.status === 'pending') {
          offer.status = 'accepted'
          const chair = db.row('project_positions', 'pos-1')!
          chair.musician_id = 'mus-1'
          chair.status = 'confirmed'
        }
      }
    }

    const res = await GET(cronRequest('Bearer test-secret'))
    const body = await res.json()

    expect(body.expired).toBe(0)
    expect(state.db.row('contract_offers', 'offer-racing')!.status).toBe('accepted')
    const chair = state.db.row('project_positions', 'pos-1')!
    expect(chair.musician_id).toBe('mus-1')
    expect(chair.status).toBe('confirmed')

    // The expiry update must carry the same optimistic lock as accept/decline.
    const updates = state.db.ops('contract_offers', 'update')
    expect(updates).toHaveLength(1)
    expect(updates[0].filters).toContainEqual({ method: 'in', args: ['status', ['pending', 'viewed']] })

    // Losing the race must not notify admins of an expiry that didn't happen.
    expect(sendOfferExpiredEmail).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })
})

describe('expire-offers cron — chair protection', () => {
  it('vacates a chair only when no other active or accepted offer holds it', async () => {
    state.db = new MockSupabaseDb({
      contract_offers: [
        // Substitution scenario: the sub's offer expired, but the original
        // musician's ACCEPTED offer still holds the chair.
        makeCronOffer({
          id: 'offer-sub-expired',
          status: 'pending',
          expires_at: PAST,
          project_position_id: 'pos-sub',
          musician: { id: 'mus-sub', first_name: 'Sam', last_name: 'Substitute', email: 'sam@example.com' },
        }),
        makeCronOffer({
          id: 'offer-orig-accepted',
          status: 'accepted',
          expires_at: null,
          project_position_id: 'pos-sub',
          musician: { id: 'mus-orig', first_name: 'Olive', last_name: 'Original', email: 'olive@example.com' },
        }),
        // Plain scenario: expired offer, nobody else on the chair.
        makeCronOffer({ id: 'offer-solo-expired', status: 'viewed', expires_at: PAST, project_position_id: 'pos-solo' }),
      ],
      project_positions: [
        makePosition({ id: 'pos-sub', musician_id: 'mus-orig', status: 'confirmed' }),
        makePosition({ id: 'pos-solo', musician_id: 'mus-1', status: 'offered' }),
      ],
    })

    const res = await GET(cronRequest('Bearer test-secret'))
    const body = await res.json()

    expect(body.expired).toBe(2)

    // Both expired offers flipped…
    expect(state.db.row('contract_offers', 'offer-sub-expired')!.status).toBe('expired')
    expect(state.db.row('contract_offers', 'offer-solo-expired')!.status).toBe('expired')
    // …but the original musician's accepted offer is untouched.
    expect(state.db.row('contract_offers', 'offer-orig-accepted')!.status).toBe('accepted')

    // The chair held via the accepted offer stays confirmed with its musician.
    const subChair = state.db.row('project_positions', 'pos-sub')!
    expect(subChair.musician_id).toBe('mus-orig')
    expect(subChair.status).toBe('confirmed')

    // The unprotected chair is vacated with no stale musician left behind.
    const soloChair = state.db.row('project_positions', 'pos-solo')!
    expect(soloChair.musician_id).toBeNull()
    expect(soloChair.status).toBe('vacant')

    // The protection lookup must include 'accepted' in its status set —
    // this is the guard that keeps the substitution flow safe.
    const guardSelects = state.db
      .ops('contract_offers', 'select')
      .filter((e: any) => e.filters.some((f: any) => f.method === 'eq' && f.args[0] === 'project_position_id'))
    expect(guardSelects.length).toBe(2)
    for (const guard of guardSelects) {
      expect(guard.filters).toContainEqual({ method: 'in', args: ['status', ['pending', 'viewed', 'accepted']] })
    }

    expect(errorSpy).not.toHaveBeenCalled()
  }, 15000)
})
