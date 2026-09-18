import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import { MockSupabaseDb, type Row } from './helpers/supabase-mock'

/**
 * BEHAVIORAL tests for the substitution approve/decline routes (launch
 * assessment A5) — the two admin actions that had no tests at all.
 *
 * Both routes read the request's status at fetch time, then ran every side
 * effect (create the substitute, insert a contract offer, email three people)
 * and only at the end wrote the status back with no condition. A double-click,
 * two admins in the same inbox, or a retry after a half-failed attempt produced
 * duplicate musicians, duplicate live offers on one chair, and duplicate email.
 *
 * The fix makes the conditional status update the FIRST durable write and the
 * only authority on whether the request is still open, so the loser of a race
 * gets a 409 and does nothing.
 */

const state = vi.hoisted(() => ({ db: undefined as any, user: undefined as any }))

let insertSeq = 0

/**
 * The shared mock resolves inserts with `{ data: null }`, but the approve route
 * needs the inserted row back (`.insert(...).select().single()`), exactly as
 * PostgREST returns it. This wrapper stamps a generated id on each inserted row
 * (the database's job in production) and resolves the chain with it. It also
 * adds `ilike`, which the route uses for the case-insensitive musician lookup,
 * as a plain equality match.
 */
function client(db: MockSupabaseDb, user: unknown) {
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    from(table: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = db.from(table)
      builder.ilike = (column: string, value: unknown) => builder.eq(column, value)

      const insert = builder.insert.bind(builder)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      builder.insert = (rows: any) => {
        const stamp = (row: Row) => ({ id: row.id ?? `${table}-${++insertSeq}`, ...row })
        const stamped = Array.isArray(rows) ? rows.map(stamp) : stamp(rows)
        insert(stamped)
        const inner = builder.then.bind(builder)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        builder.then = (onfulfilled: any, onrejected: any) =>
          inner((result: Row) => (result.error ? result : { data: stamped, error: null }), onrejected).then(onfulfilled)
        return builder
      }

      return builder
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => client(state.db, state.user),
  getOrgAdminEmails: vi.fn(async () => ['admin@example.com']),
}))

vi.mock('@/lib/venue-attach', () => ({ attachVenueDetails: vi.fn(async () => {}) }))

vi.mock('@/lib/email/send', () => ({
  formatPerformanceDateForSubject: vi.fn(() => 'Fri, Jul 10'),
  sendSubRequestApprovedEmail: vi.fn(async () => ({ id: 'em-approved', subject: 'Approved', emailHtml: '<p>ok</p>' })),
  sendSubRequestDeclinedEmail: vi.fn(async () => ({ id: 'em-declined', subject: 'Declined', emailHtml: '<p>ok</p>' })),
  sendContractOfferEmail: vi.fn(async () => ({ id: 'em-offer', subject: 'Offer', emailHtml: '<p>ok</p>' })),
  sendAdminOfferSentEmail: vi.fn(async () => ({ id: 'em-admin', subject: 'Offer sent', emailHtml: '<p>ok</p>' })),
}))

vi.mock('@/lib/email/log', () => ({ logEmail: vi.fn(async () => {}) }))

import { POST as approvePOST } from '@/app/api/substitutions/[requestId]/approve/route'
import { POST as declinePOST } from '@/app/api/substitutions/[requestId]/decline/route'
import {
  sendSubRequestApprovedEmail,
  sendSubRequestDeclinedEmail,
  sendContractOfferEmail,
  sendAdminOfferSentEmail,
} from '@/lib/email/send'

const ORG = { id: 'org-1', name: 'Test Orchestra', timezone: 'America/Chicago' }
const INSTRUMENT = { id: 'inst-1', name: 'Violin' }
const PROJECT = {
  id: 'proj-1',
  name: 'Fall Gala',
  organization_id: 'org-1',
  organization: ORG,
  services: [] as Row[],
}
const POSITION = {
  id: 'pos-1',
  chair_number: 1,
  instrument: INSTRUMENT,
  project: PROJECT,
}

function makeSubRequest(over: Partial<Row> = {}): Row {
  return {
    id: 'sub-1',
    status: 'pending_approval',
    project_position_id: 'pos-1',
    requesting_musician_id: 'mus-orig',
    substitute_musician_id: null,
    offer_id: null,
    admin_notes: null,
    suggested_sub_name: 'Sam Substitute',
    suggested_sub_email: 'sam@example.com',
    suggested_sub_phone: '555-0100',
    suggested_sub_instrument_id: 'inst-1',
    requesting_musician: { id: 'mus-orig', first_name: 'Olive', last_name: 'Original', email: 'olive@example.com' },
    service: { id: 'svc-1', name: 'Rehearsal 1', start_time: '2026-07-10T19:00:00.000Z' },
    project_position: POSITION,
    ...over,
  }
}

function makeDb(tables: Record<string, Row[]> = {}) {
  return new MockSupabaseDb({
    substitution_requests: [makeSubRequest()],
    project_positions: [
      { id: 'pos-1', project_id: 'proj-1', instrument_id: 'inst-1', chair_number: 1, musician_id: 'mus-orig', status: 'confirmed' },
    ],
    contract_offers: [
      // The original musician still holds the chair until the sub accepts.
      { id: 'offer-orig', project_position_id: 'pos-1', musician_id: 'mus-orig', status: 'accepted', responded_at: '2026-06-01T12:00:00.000Z' },
    ],
    musicians: [],
    musician_instruments: [],
    instruments: [{ id: 'inst-1', name: 'Violin' }],
    organization_members: [{ id: 'mem-1', user_id: 'user-1', organization_id: 'org-1', role: 'owner' }],
    ...tables,
  })
}

const routeParams = { params: Promise.resolve({ requestId: 'sub-1' }) }

function approveRequest(): Request {
  return new Request('http://localhost:3000/api/substitutions/sub-1/approve', { method: 'POST' })
}

function declineRequest(): Request {
  return new Request('http://localhost:3000/api/substitutions/sub-1/decline', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ adminNotes: 'Use the regular sub list please' }),
  })
}

/** Offers on the chair that any reader in the app counts as live. */
function liveOffers(db: MockSupabaseDb, positionId = 'pos-1'): Row[] {
  return db.tables.contract_offers.filter(
    (o: Row) => o.project_position_id === positionId && ['pending', 'viewed'].includes(o.status)
  )
}

let errorSpy: MockInstance
let warnSpy: MockInstance

beforeEach(() => {
  state.db = makeDb()
  state.user = { id: 'user-1', email: 'admin@example.com' }
  insertSeq = 0
  vi.clearAllMocks()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
  warnSpy.mockRestore()
})

describe('approve — happy path', () => {
  it('approves the request, creates the substitute and offers them the chair', async () => {
    const res = await approvePOST(approveRequest(), routeParams)

    expect(res.status).toBe(200)
    const request = state.db.row('substitution_requests', 'sub-1')!
    expect(request.status).toBe('approved')
    expect(request.substitute_musician_id).toBeTruthy()
    expect(request.offer_id).toBeTruthy()
    expect(liveOffers(state.db)).toHaveLength(1)
    expect(sendContractOfferEmail).toHaveBeenCalledTimes(1)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('claims the request before any side effect runs', async () => {
    await approvePOST(approveRequest(), routeParams)

    const firstWrite = state.db.log.find((entry: Row) => entry.operation === 'update' || entry.operation === 'insert')
    expect(firstWrite.table).toBe('substitution_requests')
    expect(firstWrite.filters).toContainEqual({ method: 'eq', args: ['status', 'pending_approval'] })
    expect(firstWrite.payload).toEqual({ status: 'approved' })
  })
})

describe('approve — double approval (A5)', () => {
  it('gives the second approval a 409', async () => {
    const first = await approvePOST(approveRequest(), routeParams)
    expect(first.status).toBe(200)

    const second = await approvePOST(approveRequest(), routeParams)

    expect(second.status).toBe(409)
    expect((await second.json()).error).toMatch(/already been answered/i)
  })

  it('creates no second musician, offer or email', async () => {
    await approvePOST(approveRequest(), routeParams)
    vi.clearAllMocks()
    const musiciansAfterFirst = state.db.tables.musicians.length
    const offersAfterFirst = state.db.tables.contract_offers.length

    await approvePOST(approveRequest(), routeParams)

    expect(state.db.tables.musicians).toHaveLength(musiciansAfterFirst)
    expect(state.db.tables.contract_offers).toHaveLength(offersAfterFirst)
    expect(sendSubRequestApprovedEmail).not.toHaveBeenCalled()
    expect(sendContractOfferEmail).not.toHaveBeenCalled()
    expect(sendAdminOfferSentEmail).not.toHaveBeenCalled()
  })

  it('leaves the approved request and its offer untouched', async () => {
    await approvePOST(approveRequest(), routeParams)
    const request = { ...state.db.row('substitution_requests', 'sub-1')! }

    await approvePOST(approveRequest(), routeParams)

    expect(state.db.row('substitution_requests', 'sub-1')).toMatchObject({
      status: 'approved',
      substitute_musician_id: request.substitute_musician_id,
      offer_id: request.offer_id,
    })
  })
})

describe('decline — guarded the same way (A5)', () => {
  it('declines an open request and notifies the musician', async () => {
    const res = await declinePOST(declineRequest(), routeParams)

    expect(res.status).toBe(200)
    expect(state.db.row('substitution_requests', 'sub-1')!.status).toBe('declined')
    expect(sendSubRequestDeclinedEmail).toHaveBeenCalledTimes(1)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('returns 409 and sends nothing when the request was already approved', async () => {
    await approvePOST(approveRequest(), routeParams)
    vi.clearAllMocks()

    const res = await declinePOST(declineRequest(), routeParams)

    expect(res.status).toBe(409)
    expect(state.db.row('substitution_requests', 'sub-1')!.status).toBe('approved')
    expect(sendSubRequestDeclinedEmail).not.toHaveBeenCalled()
  })

  it('does not overwrite an approval that lands mid-request', async () => {
    // Flip the request to approved between the decline route's fetch and its
    // conditional update — the window the old unguarded update lost.
    state.db.beforeOp = (entry: Row, db: MockSupabaseDb) => {
      if (entry.table === 'organization_members') {
        db.row('substitution_requests', 'sub-1')!.status = 'approved'
        db.beforeOp = undefined
      }
    }

    const res = await declinePOST(declineRequest(), routeParams)

    expect(res.status).toBe(409)
    expect(state.db.row('substitution_requests', 'sub-1')!.status).toBe('approved')
    expect(state.db.row('substitution_requests', 'sub-1')!.admin_notes).toBeNull()
  })
})

describe('approve — retry safety (A5)', () => {
  it('supersedes a stale offer from a failed attempt instead of adding a second live one', async () => {
    // A previous attempt got as far as inserting the offer and then failed, so
    // the request was handed back to the queue with the offer still live.
    state.db = makeDb({
      musicians: [{ id: 'mus-sub', organization_id: 'org-1', first_name: 'Sam', last_name: 'Substitute', email: 'sam@example.com' }],
      contract_offers: [
        { id: 'offer-orig', project_position_id: 'pos-1', musician_id: 'mus-orig', status: 'accepted', responded_at: '2026-06-01T12:00:00.000Z' },
        { id: 'offer-stale', project_position_id: 'pos-1', musician_id: 'mus-sub', status: 'pending', responded_at: null },
      ],
    })

    const res = await approvePOST(approveRequest(), routeParams)

    expect(res.status).toBe(200)
    expect(state.db.row('contract_offers', 'offer-stale')!.status).toBe('expired')
    // Exactly one offer the substitute can act on, and the row is kept.
    const live = liveOffers(state.db)
    expect(live).toHaveLength(1)
    expect(live[0].id).not.toBe('offer-stale')
    expect(state.db.tables.contract_offers).toHaveLength(3)
  })

  it('reuses the existing musician record rather than creating a duplicate', async () => {
    state.db = makeDb({
      musicians: [{ id: 'mus-sub', organization_id: 'org-1', first_name: 'Sam', last_name: 'Substitute', email: 'sam@example.com' }],
    })

    await approvePOST(approveRequest(), routeParams)

    expect(state.db.tables.musicians).toHaveLength(1)
    expect(state.db.row('substitution_requests', 'sub-1')!.substitute_musician_id).toBe('mus-sub')
  })

  it('leaves the original musician holding the chair until the sub accepts', async () => {
    await approvePOST(approveRequest(), routeParams)

    expect(state.db.row('contract_offers', 'offer-orig')!.status).toBe('accepted')
    expect(state.db.row('project_positions', 'pos-1')!.musician_id).toBe('mus-orig')
  })
})
