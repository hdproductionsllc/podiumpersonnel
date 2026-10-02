import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import { MockSupabaseDb, type Row } from './helpers/supabase-mock'
import { cascadeConstraints } from './helpers/quartet-fixture'

/**
 * BEHAVIORAL tests for the public gig accept/decline routes — the highest
 * stakes flows in the product. Unlike the source-text tripwires in
 * offer-lifecycle.test.ts, these invoke the real exported route handlers
 * against an in-memory Supabase fake and assert on resulting row state and
 * on the filters each write carried, so a terminology refactor can't
 * silently break the logic while keeping the old strings around.
 *
 * No database, no template rendering, no Resend: the Supabase service client
 * and the email send wrappers are mocked at module boundaries.
 *
 * Note: both routes swallow ALL unexpected errors into a redirect back to
 * /gig/[token], so every test also asserts console.error was not called —
 * otherwise a broken mock would false-green the redirect assertions.
 */

const state = vi.hoisted(() => ({ db: undefined as any }))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => state.db,
  getOrgAdminEmails: vi.fn(async () => ['admin@example.com']),
}))

vi.mock('@/lib/email/send', () => ({
  formatPerformanceDateForSubject: vi.fn(() => 'Fri, Jul 10'),
  sendOfferAcceptedEmail: vi.fn(async () => ({ id: 'em-accepted', subject: 'Confirmed', emailHtml: '<p>ok</p>' })),
  sendOfferDeclinedEmail: vi.fn(async () => ({ id: 'em-declined', subject: 'Thanks', emailHtml: '<p>ok</p>' })),
  sendAdminOfferResponseEmail: vi.fn(async () => ({ id: 'em-admin', subject: 'Response', emailHtml: '<p>ok</p>' })),
  sendMusicianReleasedEmail: vi.fn(async () => ({ id: 'em-released', subject: 'Released', emailHtml: '<p>ok</p>' })),
  sendSubDeclinedFindAnotherEmail: vi.fn(async () => ({ id: 'em-subdecl', subject: 'Sub declined', emailHtml: '<p>ok</p>' })),
  sendEmail: vi.fn(async () => ({ id: 'em-generic' })),
}))

vi.mock('@/lib/email/log', () => ({ hasRecentFailure: async () => false,
  logEmail: vi.fn(async () => {}),
}))

import { POST as acceptPOST } from '@/app/api/gig/[token]/accept/route'
import { POST as declinePOST } from '@/app/api/gig/[token]/decline/route'
import {
  sendOfferAcceptedEmail,
  sendOfferDeclinedEmail,
  sendAdminOfferResponseEmail,
  sendMusicianReleasedEmail,
  sendSubDeclinedFindAnotherEmail,
} from '@/lib/email/send'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG = { id: 'org-1', name: 'Test Orchestra', timezone: 'America/Chicago' }
const INSTRUMENT = { id: 'inst-1', name: 'Violin' }
const PROJECT = {
  id: 'proj-1',
  name: 'Fall Gala',
  organization_id: 'org-1',
  organization: ORG,
  services: [] as Row[],
}

/** Offer row shaped like the route's embedded select expects. */
function makeOffer(over: Partial<Row> = {}): Row {
  return {
    id: 'offer-1',
    token: 'tok-1',
    status: 'pending',
    project_position_id: 'pos-1',
    musician_id: 'mus-1',
    expires_at: null,
    responded_at: null,
    response_notes: null,
    musician: { id: 'mus-1', first_name: 'Mia', last_name: 'Musician', email: 'mia@example.com' },
    project_position: {
      id: 'pos-1',
      chair_number: 1,
      musician_id: null,
      instrument: INSTRUMENT,
      project: PROJECT,
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

function makeSubRequest(over: Partial<Row> = {}): Row {
  return {
    id: 'sub-1',
    offer_id: 'offer-1',
    status: 'approved',
    requesting_musician_id: 'mus-orig',
    service_id: 'svc-1',
    suggested_sub_name: null,
    requesting_musician: { id: 'mus-orig', first_name: 'Olive', last_name: 'Original', email: 'olive@example.com' },
    service: { id: 'svc-1', name: 'Rehearsal 1' },
    ...over,
  }
}

function gigRequest(token: string, action: 'accept' | 'decline'): Request {
  return new Request(`http://localhost:3000/api/gig/${token}/${action}`, { method: 'POST' })
}

function routeParams(token: string) {
  return { params: Promise.resolve({ token }) }
}

let errorSpy: MockInstance

beforeEach(() => {
  vi.clearAllMocks()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Accept — normal offer
// ---------------------------------------------------------------------------

describe('accept route — normal offer', () => {
  it('assigns the musician to a vacant chair and marks the offer accepted', async () => {
    state.db = new MockSupabaseDb({
      contract_offers: [makeOffer()],
      project_positions: [makePosition()],
    })

    const res = await acceptPOST(gigRequest('tok-1', 'accept'), routeParams('tok-1'))

    expect(res.headers.get('location')).toContain('/gig/tok-1')

    const offer = state.db.row('contract_offers', 'offer-1')!
    expect(offer.status).toBe('accepted')
    expect(offer.responded_at).toBeTruthy()

    const position = state.db.row('project_positions', 'pos-1')!
    expect(position.musician_id).toBe('mus-1')
    expect(position.status).toBe('confirmed')

    // The offer and the chair change together, in claim_chair's one transaction
    // (migration 094); the route writes neither table itself.
    expect(state.db.ops('claim_chair', 'rpc')).toHaveLength(1)
    expect(state.db.ops('claim_chair', 'rpc')[0].payload).toEqual({ p_offer_id: 'offer-1' })
    expect(state.db.ops('contract_offers', 'update')).toHaveLength(0)
    expect(state.db.ops('project_positions', 'update')).toHaveLength(0)

    expect(sendOfferAcceptedEmail).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendOfferAcceptedEmail).mock.calls[0][0].to).toBe('mia@example.com')
    expect(sendAdminOfferResponseEmail).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendAdminOfferResponseEmail).mock.calls[0][0].status).toBe('accepted')

    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('accepts an offer that has already been viewed', async () => {
    state.db = new MockSupabaseDb({
      contract_offers: [makeOffer({ status: 'viewed' })],
      project_positions: [makePosition()],
    })

    await acceptPOST(gigRequest('tok-1', 'accept'), routeParams('tok-1'))

    expect(state.db.row('contract_offers', 'offer-1')!.status).toBe('accepted')
    expect(state.db.row('project_positions', 'pos-1')!.musician_id).toBe('mus-1')
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('does NOT double-assign a chair another musician already won (loser retired as superseded, audit R-11)', async () => {
    // Chair already confirmed for mus-9; a second pending offer for mus-1 races in.
    state.db = new MockSupabaseDb({
      contract_offers: [makeOffer()],
      project_positions: [makePosition({ musician_id: 'mus-9', status: 'confirmed' })],
    })

    await acceptPOST(gigRequest('tok-1', 'accept'), routeParams('tok-1'))

    // The chair keeps its winner.
    const position = state.db.row('project_positions', 'pos-1')!
    expect(position.musician_id).toBe('mus-9')
    expect(position.status).toBe('confirmed')

    // The losing offer is neither left accepted nor put back to pending (which
    // offered Accept again): the chair is gone, so it is retired.
    const offer = state.db.row('contract_offers', 'offer-1')!
    expect(offer.status).toBe('superseded')
    expect(offer.responded_at).toBeTruthy()

    expect(sendOfferAcceptedEmail).not.toHaveBeenCalled()
    expect(sendAdminOfferResponseEmail).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('accepting an already-declined offer changes nothing', async () => {
    state.db = new MockSupabaseDb({
      contract_offers: [makeOffer({ status: 'declined' })],
      project_positions: [makePosition()],
    })

    await acceptPOST(gigRequest('tok-1', 'accept'), routeParams('tok-1'))

    expect(state.db.row('contract_offers', 'offer-1')!.status).toBe('declined')
    expect(state.db.row('project_positions', 'pos-1')!.musician_id).toBeNull()
    expect(state.db.ops(undefined, 'update')).toHaveLength(0)
    expect(sendOfferAcceptedEmail).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('a decline landing mid-request beats the accept (optimistic lock matches 0 rows)', async () => {
    state.db = new MockSupabaseDb({
      contract_offers: [makeOffer()],
      project_positions: [makePosition()],
    })
    // Simulate a concurrent decline committing between the route's initial
    // fetch (status still pending) and its guarded update: flip the status
    // during the mid-request substitution lookup.
    state.db.beforeOp = (entry: any, db: MockSupabaseDb) => {
      if (entry.table === 'substitution_requests') {
        db.row('contract_offers', 'offer-1')!.status = 'declined'
        db.beforeOp = undefined
      }
    }

    await acceptPOST(gigRequest('tok-1', 'accept'), routeParams('tok-1'))

    // The decline wins; the accept neither lands nor touches the chair.
    expect(state.db.row('contract_offers', 'offer-1')!.status).toBe('declined')
    expect(state.db.ops('project_positions', 'update')).toHaveLength(0)
    expect(state.db.row('project_positions', 'pos-1')!.musician_id).toBeNull()
    expect(sendOfferAcceptedEmail).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Accept — substitution transfer
// ---------------------------------------------------------------------------

describe('accept route — substitution transfer', () => {
  function seedSubScenario(positionOver: Partial<Row> = {}) {
    state.db = new MockSupabaseDb({
      contract_offers: [
        // The substitute's pending offer (embedded snapshot shows the chair
        // still held by the original musician).
        makeOffer({
          id: 'offer-sub',
          token: 'tok-sub',
          musician_id: 'mus-sub',
          musician: { id: 'mus-sub', first_name: 'Sam', last_name: 'Substitute', email: 'sam@example.com' },
          project_position: {
            id: 'pos-1',
            chair_number: 1,
            musician_id: 'mus-orig',
            instrument: INSTRUMENT,
            project: PROJECT,
          },
        }),
        // The original musician's accepted offer for the same chair.
        makeOffer({
          id: 'offer-orig',
          token: 'tok-orig',
          status: 'accepted',
          musician_id: 'mus-orig',
          musician: { id: 'mus-orig', first_name: 'Olive', last_name: 'Original', email: 'olive@example.com' },
        }),
      ],
      project_positions: [makePosition({ musician_id: 'mus-orig', status: 'confirmed', ...positionOver })],
      substitution_requests: [makeSubRequest({ offer_id: 'offer-sub' })],
    })
  }

  it('transfers the chair from the requesting musician to the substitute', async () => {
    seedSubScenario()
    // 095's indexes and 094's CHECK: the original is released before the substitute
    // is accepted, so the chair never holds two accepted offers.
    state.db.constraint = cascadeConstraints

    await acceptPOST(gigRequest('tok-sub', 'accept'), routeParams('tok-sub'))

    // Chair now belongs to the substitute.
    const position = state.db.row('project_positions', 'pos-1')!
    expect(position.musician_id).toBe('mus-sub')
    expect(position.status).toBe('confirmed')

    // Offer statuses: sub accepted, original released, request filled.
    expect(state.db.row('contract_offers', 'offer-sub')!.status).toBe('accepted')
    expect(state.db.row('contract_offers', 'offer-orig')!.status).toBe('released')
    expect(state.db.row('substitution_requests', 'sub-1')!.status).toBe('filled')

    // Original musician is told they were released; substitute gets confirmation.
    expect(sendMusicianReleasedEmail).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendMusicianReleasedEmail).mock.calls[0][0].to).toBe('olive@example.com')
    expect(sendOfferAcceptedEmail).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendOfferAcceptedEmail).mock.calls[0][0].to).toBe('sam@example.com')

    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('does not steal the chair when the requesting musician no longer holds it', async () => {
    // Chair was reassigned to a third musician before the sub accepted.
    seedSubScenario({ musician_id: 'mus-third' })

    await acceptPOST(gigRequest('tok-sub', 'accept'), routeParams('tok-sub'))

    // Nothing transfers and nothing is released. The sub's offer and request
    // are closed rather than left open forever (audit R-11, S11).
    const position = state.db.row('project_positions', 'pos-1')!
    expect(position.musician_id).toBe('mus-third')
    expect(state.db.row('contract_offers', 'offer-sub')!.status).toBe('superseded')
    expect(state.db.row('contract_offers', 'offer-orig')!.status).toBe('accepted')
    expect(state.db.row('substitution_requests', 'sub-1')!.status).toBe('cancelled')

    expect(sendMusicianReleasedEmail).not.toHaveBeenCalled()
    expect(sendOfferAcceptedEmail).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Decline — race safety
// ---------------------------------------------------------------------------

describe('decline route — race safety', () => {
  it('declines a pending offer and vacates the chair', async () => {
    state.db = new MockSupabaseDb({
      contract_offers: [makeOffer()],
      project_positions: [makePosition()],
    })

    const res = await declinePOST(gigRequest('tok-1', 'decline'), routeParams('tok-1'))

    expect(res.headers.get('location')).toContain('/gig/tok-1')

    const offer = state.db.row('contract_offers', 'offer-1')!
    expect(offer.status).toBe('declined')
    expect(offer.responded_at).toBeTruthy()

    // Chair is fully vacated — no stale musician left on a vacant chair.
    const position = state.db.row('project_positions', 'pos-1')!
    expect(position.musician_id).toBeNull()
    expect(position.status).toBe('vacant')

    // The decline write must carry the optimistic lock.
    const declineUpdate = state.db
      .ops('contract_offers', 'update')
      .find((e: any) => (e.payload as Row).status === 'declined')!
    expect(declineUpdate).toBeDefined()
    expect(declineUpdate.filters).toContainEqual({ method: 'in', args: ['status', ['pending', 'viewed']] })

    expect(sendOfferDeclinedEmail).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendAdminOfferResponseEmail).mock.calls[0][0].status).toBe('declined')
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('declining an already-accepted offer does NOT vacate the confirmed chair', async () => {
    state.db = new MockSupabaseDb({
      contract_offers: [makeOffer({ status: 'accepted' })],
      project_positions: [makePosition({ musician_id: 'mus-1', status: 'confirmed' })],
    })

    await declinePOST(gigRequest('tok-1', 'decline'), routeParams('tok-1'))

    expect(state.db.row('contract_offers', 'offer-1')!.status).toBe('accepted')
    const position = state.db.row('project_positions', 'pos-1')!
    expect(position.musician_id).toBe('mus-1')
    expect(position.status).toBe('confirmed')
    expect(state.db.ops(undefined, 'update')).toHaveLength(0)
    expect(sendOfferDeclinedEmail).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('an accept landing mid-request is not clobbered by a stale decline', async () => {
    state.db = new MockSupabaseDb({
      contract_offers: [makeOffer()],
      project_positions: [makePosition({ musician_id: 'mus-1', status: 'confirmed' })],
    })
    // Concurrent accept commits between the decline's fetch and its guarded
    // update: flip the status during the mid-request substitution lookup.
    state.db.beforeOp = (entry: any, db: MockSupabaseDb) => {
      if (entry.table === 'substitution_requests') {
        db.row('contract_offers', 'offer-1')!.status = 'accepted'
        db.beforeOp = undefined
      }
    }

    await declinePOST(gigRequest('tok-1', 'decline'), routeParams('tok-1'))

    // The accept wins; the confirmed chair is never vacated.
    expect(state.db.row('contract_offers', 'offer-1')!.status).toBe('accepted')
    expect(state.db.ops('project_positions', 'update')).toHaveLength(0)
    const position = state.db.row('project_positions', 'pos-1')!
    expect(position.musician_id).toBe('mus-1')
    expect(position.status).toBe('confirmed')
    expect(sendOfferDeclinedEmail).not.toHaveBeenCalled()
    expect(sendAdminOfferResponseEmail).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('a substitute declining keeps the chair with the original musician', async () => {
    state.db = new MockSupabaseDb({
      contract_offers: [
        makeOffer({
          id: 'offer-sub',
          token: 'tok-sub',
          musician_id: 'mus-sub',
          musician: { id: 'mus-sub', first_name: 'Sam', last_name: 'Substitute', email: 'sam@example.com' },
        }),
        makeOffer({
          id: 'offer-orig',
          token: 'tok-orig',
          status: 'accepted',
          musician_id: 'mus-orig',
          musician: { id: 'mus-orig', first_name: 'Olive', last_name: 'Original', email: 'olive@example.com' },
        }),
      ],
      project_positions: [makePosition({ musician_id: 'mus-orig', status: 'confirmed' })],
      substitution_requests: [makeSubRequest({ offer_id: 'offer-sub' })],
    })

    await declinePOST(gigRequest('tok-sub', 'decline'), routeParams('tok-sub'))

    // Sub's offer declined, but the chair is untouched.
    expect(state.db.row('contract_offers', 'offer-sub')!.status).toBe('declined')
    expect(state.db.ops('project_positions', 'update')).toHaveLength(0)
    const position = state.db.row('project_positions', 'pos-1')!
    expect(position.musician_id).toBe('mus-orig')
    expect(position.status).toBe('confirmed')

    // Original musician keeps their accepted offer and is told to find another sub.
    expect(state.db.row('contract_offers', 'offer-orig')!.status).toBe('accepted')
    expect(state.db.row('substitution_requests', 'sub-1')!.status).toBe('sub_declined')
    expect(sendSubDeclinedFindAnotherEmail).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendSubDeclinedFindAnotherEmail).mock.calls[0][0].to).toBe('olive@example.com')
    expect(errorSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Cascade guards (Release 0, A0.3)
// ---------------------------------------------------------------------------

describe('decline never evicts whoever holds the chair (audit R-2)', () => {
  it('leaves a chair someone else holds exactly as it was', async () => {
    // Mia's offer is still live, but the chair went to Rebecca another way
    // (a second accepted offer, a book import, or a direct assignment).
    state.db = new MockSupabaseDb({
      contract_offers: [makeOffer()],
      project_positions: [makePosition({ musician_id: 'mus-rebecca', status: 'confirmed' })],
    })

    await declinePOST(gigRequest('tok-1', 'decline'), routeParams('tok-1'))

    expect(state.db.row('contract_offers', 'offer-1')!.status).toBe('declined')
    const position = state.db.row('project_positions', 'pos-1')!
    expect(position.musician_id).toBe('mus-rebecca')
    expect(position.status).toBe('confirmed')

    // The vacate write itself requires an empty chair.
    const vacate = state.db.ops('project_positions', 'update')[0]
    expect(vacate.filters).toContainEqual({ method: 'is', args: ['musician_id', null] })
    expect(errorSpy).not.toHaveBeenCalled()
  })
})

describe('a closed offer cannot be answered (audit R-5, R-9)', () => {
  const withProjectStatus = (status: string): Partial<Row> => ({
    project_position: { ...makeOffer().project_position, project: { ...PROJECT, status } },
  })

  const closedCases: [string, Partial<Row>][] = [
    ['the gig was cancelled', withProjectStatus('cancelled')],
    ['the gig is already completed', withProjectStatus('completed')],
    ['the musician was deactivated', { musician: { ...makeOffer().musician, is_active: false } }],
  ]

  it.each(closedCases)('accept is refused when %s', async (_label, over) => {
    state.db = new MockSupabaseDb({
      contract_offers: [makeOffer(over)],
      project_positions: [makePosition()],
    })

    const res = await acceptPOST(gigRequest('tok-1', 'accept'), routeParams('tok-1'))

    expect(res.headers.get('location')).toContain('/gig/tok-1')
    expect(state.db.row('contract_offers', 'offer-1')!.status).toBe('pending')
    expect(state.db.row('project_positions', 'pos-1')!.musician_id).toBeNull()
    expect(state.db.ops('contract_offers', 'update')).toHaveLength(0)
    expect(state.db.ops('project_positions', 'update')).toHaveLength(0)
    // Nobody is told "Confirmed" for a gig that is not happening.
    expect(sendOfferAcceptedEmail).not.toHaveBeenCalled()
    expect(sendAdminOfferResponseEmail).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it.each(closedCases)('decline is refused when %s', async (_label, over) => {
    state.db = new MockSupabaseDb({
      contract_offers: [makeOffer(over)],
      project_positions: [makePosition()],
    })

    await declinePOST(gigRequest('tok-1', 'decline'), routeParams('tok-1'))

    expect(state.db.row('contract_offers', 'offer-1')!.status).toBe('pending')
    expect(state.db.ops('contract_offers', 'update')).toHaveLength(0)
    expect(sendOfferDeclinedEmail).not.toHaveBeenCalled()
    expect(sendAdminOfferResponseEmail).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it.each(['draft', 'active'])('a %s gig still accepts as before', async (status) => {
    state.db = new MockSupabaseDb({
      contract_offers: [makeOffer(withProjectStatus(status))],
      project_positions: [makePosition()],
    })

    await acceptPOST(gigRequest('tok-1', 'accept'), routeParams('tok-1'))

    expect(state.db.row('contract_offers', 'offer-1')!.status).toBe('accepted')
    expect(state.db.row('project_positions', 'pos-1')!.musician_id).toBe('mus-1')
    expect(errorSpy).not.toHaveBeenCalled()
  })
})
