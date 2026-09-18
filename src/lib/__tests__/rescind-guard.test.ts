import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import { MockSupabaseDb, type Row } from './helpers/supabase-mock'

/**
 * BEHAVIORAL tests for the admin rescind route (launch assessment A3).
 *
 * The route used to fetch the offer with `.in('status', ['pending','viewed'])`
 * and then update it by id alone. A musician accepting in that gap had their
 * acceptance overwritten with 'rescinded' while `project_positions` still said
 * confirmed — a chair that is filled and withdrawn at the same time, plus a
 * "your offer was withdrawn" email to someone who is on the gig.
 *
 * These drive the real handler against the in-memory Supabase fake and assert
 * on row state, on the filters the guarded write carried, and on which emails
 * did NOT go out.
 */

const state = vi.hoisted(() => ({ db: undefined as any, user: undefined as any }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => state.db.from(table),
    auth: { getUser: async () => ({ data: { user: state.user } }) },
  }),
  getOrgAdminEmails: vi.fn(async () => ['admin@example.com']),
}))

vi.mock('@/lib/email/send', () => ({
  formatPerformanceDateForSubject: vi.fn(() => 'Fri, Jul 10'),
  sendOfferRescindedEmail: vi.fn(async () => ({ id: 'em-rescinded', subject: 'Withdrawn', emailHtml: '<p>ok</p>' })),
  sendAdminOfferResponseEmail: vi.fn(async () => ({ id: 'em-admin', subject: 'Response', emailHtml: '<p>ok</p>' })),
  sendSubDeclinedFindAnotherEmail: vi.fn(async () => ({ id: 'em-subdecl', subject: 'Sub declined', emailHtml: '<p>ok</p>' })),
}))

vi.mock('@/lib/email/log', () => ({ logEmail: vi.fn(async () => {}) }))

import { POST as rescindPOST } from '@/app/api/positions/[positionId]/rescind-offer/route'
import { sendOfferRescindedEmail, sendAdminOfferResponseEmail } from '@/lib/email/send'

const ORG = { id: 'org-1', name: 'Test Orchestra', timezone: 'America/Chicago' }
const INSTRUMENT = { id: 'inst-1', name: 'Violin' }
const PROJECT = {
  id: 'proj-1',
  name: 'Fall Gala',
  organization_id: 'org-1',
  organization: ORG,
  services: [] as Row[],
}

function makePosition(over: Partial<Row> = {}): Row {
  return {
    id: 'pos-1',
    project_id: 'proj-1',
    instrument_id: 'inst-1',
    chair_number: 1,
    musician_id: null,
    status: 'offered',
    instrument: INSTRUMENT,
    project: PROJECT,
    ...over,
  }
}

function makeOffer(over: Partial<Row> = {}): Row {
  return {
    id: 'offer-1',
    token: 'tok-1',
    status: 'pending',
    project_position_id: 'pos-1',
    musician_id: 'mus-1',
    responded_at: null,
    response_notes: null,
    musician: { id: 'mus-1', first_name: 'Mia', last_name: 'Musician', email: 'mia@example.com' },
    ...over,
  }
}

function seed(tables: Record<string, Row[]> = {}) {
  return new MockSupabaseDb({
    project_positions: [makePosition()],
    contract_offers: [makeOffer()],
    organization_members: [{ id: 'mem-1', user_id: 'user-1', organization_id: 'org-1', role: 'owner' }],
    substitution_requests: [],
    ...tables,
  })
}

function rescindRequest(): Request {
  return new Request('http://localhost:3000/api/positions/pos-1/rescind-offer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason: 'Programme changed' }),
  })
}

const routeParams = { params: Promise.resolve({ positionId: 'pos-1' }) }

let errorSpy: MockInstance
let warnSpy: MockInstance

beforeEach(() => {
  state.db = seed()
  state.user = { id: 'user-1', email: 'admin@example.com' }
  vi.clearAllMocks()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
  warnSpy.mockRestore()
})

describe('rescind — happy path', () => {
  it('rescinds the outstanding offer and vacates the chair', async () => {
    const res = await rescindPOST(rescindRequest() as any, routeParams)

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, status: 'rescinded' })
    expect(state.db.row('contract_offers', 'offer-1')!.status).toBe('rescinded')
    expect(state.db.row('project_positions', 'pos-1')!.status).toBe('vacant')
    expect(sendOfferRescindedEmail).toHaveBeenCalledTimes(1)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('locks the offer update to the statuses the fetch selected', async () => {
    await rescindPOST(rescindRequest() as any, routeParams)

    const update = state.db.ops('contract_offers', 'update')[0]
    expect(update.filters).toContainEqual({ method: 'eq', args: ['id', 'offer-1'] })
    expect(update.filters).toContainEqual({ method: 'in', args: ['status', ['pending', 'viewed']] })
  })
})

describe('rescind — the musician answers first (A3)', () => {
  /** Flip the offer to accepted the moment the route looks for a substitution
   *  request: that read sits between the offer fetch and the guarded update. */
  function acceptDuringRequest() {
    state.db.beforeOp = (entry: any, db: MockSupabaseDb) => {
      if (entry.table === 'substitution_requests' && entry.operation === 'select') {
        db.row('contract_offers', 'offer-1')!.status = 'accepted'
        db.row('contract_offers', 'offer-1')!.responded_at = '2026-09-18T10:00:00.000Z'
        db.row('project_positions', 'pos-1')!.status = 'confirmed'
        db.row('project_positions', 'pos-1')!.musician_id = 'mus-1'
        db.beforeOp = undefined
      }
    }
  }

  it('returns 409 instead of overwriting the acceptance', async () => {
    acceptDuringRequest()

    const res = await rescindPOST(rescindRequest() as any, routeParams)

    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/already answered/i)
    expect(state.db.row('contract_offers', 'offer-1')!.status).toBe('accepted')
    expect(state.db.row('contract_offers', 'offer-1')!.responded_at).toBe('2026-09-18T10:00:00.000Z')
  })

  it('leaves the chair confirmed and sends no email', async () => {
    acceptDuringRequest()

    await rescindPOST(rescindRequest() as any, routeParams)

    expect(state.db.row('project_positions', 'pos-1')!.status).toBe('confirmed')
    expect(state.db.row('project_positions', 'pos-1')!.musician_id).toBe('mus-1')
    expect(sendOfferRescindedEmail).not.toHaveBeenCalled()
    expect(sendAdminOfferResponseEmail).not.toHaveBeenCalled()
  })
})

describe('rescind — the chair went to someone else', () => {
  it('does not vacate a chair another musician now holds', async () => {
    state.db = seed({
      project_positions: [makePosition({ musician_id: 'mus-other', status: 'confirmed' })],
    })

    const res = await rescindPOST(rescindRequest() as any, routeParams)

    expect(res.status).toBe(200)
    expect(state.db.row('contract_offers', 'offer-1')!.status).toBe('rescinded')
    expect(state.db.row('project_positions', 'pos-1')!.status).toBe('confirmed')
    expect(state.db.row('project_positions', 'pos-1')!.musician_id).toBe('mus-other')
  })
})
