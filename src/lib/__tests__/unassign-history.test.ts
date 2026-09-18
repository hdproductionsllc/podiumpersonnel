import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import { MockSupabaseDb, type Row } from './helpers/supabase-mock'

/**
 * BEHAVIORAL tests for the admin unassign route (launch assessment A4).
 *
 * The route used to hard-DELETE every contract_offer on the chair, including
 * the 'accepted' row. That row is the only record that the musician ever said
 * yes, so "did they accept?" became unanswerable in a pay dispute — and it was
 * the one transition in the app that destroyed history rather than moving a
 * status.
 *
 * The replacement is two conditional status updates ('accepted' → 'released',
 * 'pending'/'viewed' → 'rescinded'). These tests pin both halves of what that
 * has to achieve: the history survives, AND nothing left behind reads as an
 * active offer, so the chair is genuinely vacant.
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
  sendPositionUnassignedEmail: vi.fn(async () => ({ id: 'em-unassigned', subject: 'Position Update', emailHtml: '<p>ok</p>' })),
  sendEmail: vi.fn(async () => ({ id: 'em-generic' })),
}))

vi.mock('@/lib/email/log', () => ({ logEmail: vi.fn(async () => {}) }))

import { POST as unassignPOST } from '@/app/api/positions/[positionId]/unassign/route'

/** The statuses every reader in the app counts as a live offer on a chair:
 *  next-candidate.ts, the expire-offers cron and the project offers table. */
const ACTIVE_STATUSES = ['pending', 'viewed', 'accepted']

const ORG = { id: 'org-1', name: 'Test Orchestra', timezone: 'America/Chicago' }
const INSTRUMENT = { id: 'inst-1', name: 'Violin' }
const PROJECT = {
  id: 'proj-1',
  name: 'Fall Gala',
  organization_id: 'org-1',
  organization: ORG,
  services: [] as Row[],
}

const ACCEPTED_AT = '2026-07-01T15:00:00.000Z'

function makeDb() {
  return new MockSupabaseDb({
    project_positions: [
      {
        id: 'pos-1',
        project_id: 'proj-1',
        instrument_id: 'inst-1',
        chair_number: 1,
        musician_id: 'mus-seated',
        status: 'confirmed',
        instrument: INSTRUMENT,
        project: PROJECT,
        musician: { id: 'mus-seated', first_name: 'Mia', last_name: 'Musician', email: 'mia@example.com' },
      },
    ],
    contract_offers: [
      // The musician who is being unassigned — the row a pay dispute turns on.
      {
        id: 'offer-accepted',
        project_position_id: 'pos-1',
        musician_id: 'mus-seated',
        status: 'accepted',
        responded_at: ACCEPTED_AT,
      },
      // Someone earlier in the call order who said no.
      {
        id: 'offer-declined',
        project_position_id: 'pos-1',
        musician_id: 'mus-declined',
        status: 'declined',
        responded_at: '2026-06-20T12:00:00.000Z',
      },
      // A stray outstanding offer on the same chair.
      {
        id: 'offer-pending',
        project_position_id: 'pos-1',
        musician_id: 'mus-pending',
        status: 'pending',
        responded_at: null,
      },
      // A different chair must not be touched.
      {
        id: 'offer-other-chair',
        project_position_id: 'pos-2',
        musician_id: 'mus-seated',
        status: 'accepted',
        responded_at: ACCEPTED_AT,
      },
    ],
    organization_members: [{ id: 'mem-1', user_id: 'user-1', organization_id: 'org-1', role: 'owner' }],
  })
}

function unassignRequest(): Request {
  return new Request('http://localhost:3000/api/positions/pos-1/unassign', { method: 'POST' })
}

const routeParams = { params: Promise.resolve({ positionId: 'pos-1' }) }

let errorSpy: MockInstance
let warnSpy: MockInstance

beforeEach(() => {
  state.db = makeDb()
  state.user = { id: 'user-1', email: 'admin@example.com' }
  vi.clearAllMocks()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
  warnSpy.mockRestore()
})

describe('unassign — offer history survives (A4)', () => {
  it('keeps every offer row instead of deleting them', async () => {
    const res = await unassignPOST(unassignRequest() as any, routeParams)

    expect(res.status).toBe(200)
    expect(state.db.tables.contract_offers).toHaveLength(4)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it("moves the musician's acceptance to 'released', preserving when they accepted", async () => {
    await unassignPOST(unassignRequest() as any, routeParams)

    const accepted = state.db.row('contract_offers', 'offer-accepted')!
    expect(accepted.status).toBe('released')
    expect(accepted.musician_id).toBe('mus-seated')
    // The acceptance timestamp is the evidence; unassigning must not rewrite it.
    expect(accepted.responded_at).toBe(ACCEPTED_AT)
  })

  it("rescinds an unanswered offer on the chair rather than erasing it", async () => {
    await unassignPOST(unassignRequest() as any, routeParams)

    const pending = state.db.row('contract_offers', 'offer-pending')!
    expect(pending.status).toBe('rescinded')
    expect(pending.responded_at).toBeTruthy()
  })

  it('leaves an earlier decline exactly as it was', async () => {
    await unassignPOST(unassignRequest() as any, routeParams)

    expect(state.db.row('contract_offers', 'offer-declined')!.status).toBe('declined')
  })

  it('does not touch offers on other chairs', async () => {
    await unassignPOST(unassignRequest() as any, routeParams)

    expect(state.db.row('contract_offers', 'offer-other-chair')!.status).toBe('accepted')
  })
})

describe('unassign — the chair reads vacant afterwards', () => {
  it('empties the position row', async () => {
    await unassignPOST(unassignRequest() as any, routeParams)

    const position = state.db.row('project_positions', 'pos-1')!
    expect(position.musician_id).toBeNull()
    expect(position.status).toBe('vacant')
  })

  it('leaves no offer that any reader counts as active', async () => {
    await unassignPOST(unassignRequest() as any, routeParams)

    const stillActive = state.db.tables.contract_offers.filter(
      (o: Row) => o.project_position_id === 'pos-1' && ACTIVE_STATUSES.includes(o.status)
    )
    expect(stillActive).toEqual([])
  })

  it('scopes both status updates to this position and to non-terminal rows', async () => {
    await unassignPOST(unassignRequest() as any, routeParams)

    const updates = state.db.ops('contract_offers', 'update')
    expect(updates).toHaveLength(2)
    for (const update of updates) {
      expect(update.filters).toContainEqual({ method: 'eq', args: ['project_position_id', 'pos-1'] })
    }
    expect(updates[0].payload).toMatchObject({ status: 'released' })
    expect(updates[0].filters).toContainEqual({ method: 'eq', args: ['status', 'accepted'] })
    expect(updates[1].payload).toMatchObject({ status: 'rescinded' })
    expect(updates[1].filters).toContainEqual({ method: 'in', args: ['status', ['pending', 'viewed']] })
  })
})
