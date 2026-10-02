import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { buildQuartet, QUARTET_ORG, QUARTET_RANKING, type QuartetFixture } from './helpers/quartet-fixture'
import type { Row } from './helpers/supabase-mock'

/**
 * Every cascade transition writes its staffing_events row (migration 092,
 * src/lib/staffing/events.ts). Each test drives the REAL route against the
 * quartet fixture and asserts the history row(s) it leaves: who (actor),
 * what (action, entity), and the before/after that changed.
 *
 * Also asserted: the history is bookkeeping only. When the table cannot be
 * written (migration not applied, database hiccup) the musician's or admin's
 * action still completes exactly as before.
 *
 * Not reachable from here, because there is no server code to call: the book
 * import dialog, position delete, project cancel and musician deactivation all
 * write from the browser (target architecture PR 10 moves them server-side).
 */

const state = vi.hoisted(() => ({
  q: undefined as unknown as QuartetFixture,
  user: null as unknown,
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
  getOrgPlan: vi.fn(async () => null),
  getOrgVertical: vi.fn(async () => ({ terms: { person: { singular: 'Musician', plural: 'Musicians' } } })),
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
    sendOfferRescindedEmail: sent('offer-rescinded'),
    sendMusicianReleasedEmail: sent('musician-released'),
    sendSubDeclinedFindAnotherEmail: sent('sub-declined'),
    sendSubRequestApprovedEmail: sent('sub-request-approved'),
    sendSubRequestDeclinedEmail: sent('sub-request-declined'),
    sendAdminSubRequestEmail: sent('admin-sub-request'),
    sendPositionUnassignedEmail: sent('position-unassigned'),
    sendEmail: sent('generic'),
  }
})

vi.mock('@/lib/email/log', () => ({ logEmail: vi.fn(async () => {}) }))
vi.mock('@/lib/email/client', () => ({ logEmailConfig: vi.fn() }))
vi.mock('@/lib/venue-attach', () => ({ attachVenueDetails: vi.fn(async () => {}) }))
vi.mock('@/lib/staffing/candidates', () => ({
  getNextCandidates: vi.fn(async () => ({ candidates: [], totalAvailable: 0 })),
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/components/gig/gig-page-client', () => ({ GigPageClient: () => null }))

import GigPage from '@/app/gig/[token]/page'
import { POST as acceptPOST } from '@/app/api/gig/[token]/accept/route'
import { POST as declinePOST } from '@/app/api/gig/[token]/decline/route'
import { POST as requestSubPOST } from '@/app/api/gig/[token]/request-sub/route'
import { POST as sendEmailPOST } from '@/app/api/offers/send-email/route'
import { POST as rescindPOST } from '@/app/api/positions/[positionId]/rescind-offer/route'
import { POST as assignPOST } from '@/app/api/positions/[positionId]/assign/route'
import { POST as unassignPOST } from '@/app/api/positions/[positionId]/unassign/route'
import { POST as approvePOST } from '@/app/api/substitutions/[requestId]/approve/route'
import { POST as subDeclinePOST } from '@/app/api/substitutions/[requestId]/decline/route'
import { PUT as autoPopulatePUT } from '@/app/api/projects/[projectId]/auto-populate/route'
import { GET as expireGET } from '@/app/api/cron/expire-offers/route'

const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString()
const R = QUARTET_RANKING
const ORG = QUARTET_ORG.id
const q = () => state.q

let errorSpy: MockInstance

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'test-secret'
  delete process.env.CRON_ENABLED
  state.q = buildQuartet()
  state.user = ADMIN
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

const post = (url: string, body?: unknown) =>
  new Request(`http://localhost:3000${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const tokenParams = (row: Row) => ({ params: Promise.resolve({ token: row.token as string }) })
const positionParams = (positionId: string) => ({ params: Promise.resolve({ positionId }) })
const requestParams = (requestId: string) => ({ params: Promise.resolve({ requestId }) })

async function respond(row: Row, action: 'accept' | 'decline') {
  q().hydrate()
  const route = action === 'accept' ? acceptPOST : declinePOST
  return route(post(`/api/gig/${row.token}/${action}`), tokenParams(row))
}

const sendEmail = (offerId: string) => sendEmailPOST(post('/api/offers/send-email', { offerId }) as NextRequest)

const runCron = () =>
  expireGET(new NextRequest('http://localhost:3000/api/cron/expire-offers', { headers: { authorization: 'Bearer test-secret' } }))

/** The original musician accepts V1, then asks for Sam to cover. */
async function seatedWithSubRequest() {
  const original = q().sendOffer('v1', R.v1[0])
  await respond(original, 'accept')
  q().hydrate()
  const res = await requestSubPOST(
    post(`/api/gig/${original.token}/request-sub`, {
      reason: 'Family conflict',
      subFirstName: 'Sam',
      subLastName: 'Sub',
      subEmail: 'sam.sub@example.com',
      subInstrumentId: 'inst-violin',
    }),
    tokenParams(original)
  )
  expect(res.status).toBe(200)
  q().hydrate()
  return { original, request: q().db.tables.substitution_requests[0] }
}

async function approve(requestId: string) {
  const res = await approvePOST(post(`/api/substitutions/${requestId}/approve`), requestParams(requestId))
  expect(res.status).toBe(200)
  q().hydrate()
  return q().db.tables.contract_offers.find((o) => o.musician_id !== R.v1[0])!
}

/** History rows, oldest first. */
const events = () => q().db.tables.staffing_events ?? []
const eventsFor = (entityId: unknown) => events().filter((e) => e.entity_id === entityId)
const actions = () => events().map((e) => e.action)

// ---------------------------------------------------------------------------

describe('offers', () => {
  it('sending an offer records offer.sent by the admin', async () => {
    const row = q().sendOffer('v1', R.v1[0])
    expect((await sendEmail(row.id as string)).status).toBe(200)

    expect(events()).toEqual([
      expect.objectContaining({
        organization_id: ORG,
        actor_type: 'admin',
        actor_id: ADMIN.id,
        entity_type: 'offer',
        entity_id: row.id,
        action: 'offer.sent',
        after: expect.objectContaining({ status: 'pending', position_id: 'pos-v1', musician_id: R.v1[0], delivery: 'sent' }),
      }),
    ])
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('a new offer on the chair records the one it superseded', async () => {
    const first = q().sendOffer('v1', R.v1[0], { supersede: false })
    const second = q().sendOffer('v1', R.v1[1], { supersede: false })
    await sendEmail(second.id as string)

    expect(eventsFor(first.id)).toEqual([
      expect.objectContaining({
        action: 'offer.superseded',
        actor_type: 'admin',
        after: expect.objectContaining({ status: 'expired', replaced_by: second.id, musician_id: R.v1[0] }),
      }),
    ])
    expect(actions()).toEqual(['offer.superseded', 'offer.sent'])
  })

  it('the musician opening the gig page records offer.viewed once', async () => {
    const row = q().sendOffer('v1', R.v1[0])
    state.user = null // the musician, from the emailed link
    await GigPage({ params: Promise.resolve({ token: row.token as string }) })
    await GigPage({ params: Promise.resolve({ token: row.token as string }) })

    expect(events()).toEqual([
      expect.objectContaining({
        actor_type: 'musician',
        actor_id: R.v1[0],
        entity_id: row.id,
        action: 'offer.viewed',
        before: { status: 'pending' },
        after: { status: 'viewed' },
      }),
    ])
  })

  it('staff previewing the offer records nothing', async () => {
    const row = q().sendOffer('v1', R.v1[0])
    await GigPage({ params: Promise.resolve({ token: row.token as string }) })
    expect(events()).toEqual([])
  })

  it('accepting records offer.accepted by the musician', async () => {
    const row = q().sendOffer('v1', R.v1[0])
    await respond(row, 'accept')

    expect(events()).toEqual([
      expect.objectContaining({
        actor_type: 'musician',
        actor_id: R.v1[0],
        entity_id: row.id,
        action: 'offer.accepted',
        before: { status: 'pending' },
        after: { status: 'accepted', position_id: 'pos-v1', musician_id: R.v1[0] },
      }),
    ])
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('an accept that lost the chair records the attempt (the offer row alone forgets it)', async () => {
    const row = q().sendOffer('v1', R.v1[0])
    const chair = q().chair('v1')
    chair.musician_id = R.v1[1]
    chair.status = 'confirmed'

    await respond(row, 'accept')

    expect(q().db.row('contract_offers', row.id as string)!.status).toBe('pending')
    expect(events()).toEqual([
      expect.objectContaining({
        actor_type: 'musician',
        action: 'offer.accept_reverted',
        after: expect.objectContaining({ status: 'pending', reason: 'position_filled' }),
      }),
    ])
  })

  it('declining records offer.declined and that the chair was freed', async () => {
    const row = q().sendOffer('v1', R.v1[0])
    await respond(row, 'decline')

    expect(events()).toEqual([
      expect.objectContaining({
        actor_type: 'musician',
        actor_id: R.v1[0],
        action: 'offer.declined',
        after: expect.objectContaining({ status: 'declined', seat_released: true }),
      }),
    ])
  })

  it('a decline into a chair someone else holds records that the chair was NOT freed', async () => {
    const row = q().sendOffer('v1', R.v1[0])
    const chair = q().chair('v1')
    chair.musician_id = R.v1[1]
    chair.status = 'confirmed'

    await respond(row, 'decline')

    expect(q().chair('v1')).toMatchObject({ musician_id: R.v1[1], status: 'confirmed' })
    expect(events()[0].after).toMatchObject({ status: 'declined', seat_released: false })
  })

  it('the expire cron records offer.expired as the system', async () => {
    const row = q().sendOffer('viola', R.viola[0], { expiresAt: PAST })
    expect((await (await runCron()).json()).expired).toBe(1)

    expect(events()).toEqual([
      expect.objectContaining({
        actor_type: 'system',
        actor_id: null,
        entity_id: row.id,
        action: 'offer.expired',
        before: { status: 'pending' },
        after: expect.objectContaining({ status: 'expired', position_id: 'pos-viola', seat_released: true }),
      }),
    ])
  })

  it('a second cron run records nothing more', async () => {
    q().sendOffer('viola', R.viola[0], { expiresAt: PAST })
    await runCron()
    await runCron()
    expect(actions()).toEqual(['offer.expired'])
  })

  it('rescinding records offer.rescinded by the admin, with the reason', async () => {
    const row = q().sendOffer('v1', R.v1[0])
    const res = await rescindPOST(
      post('/api/positions/pos-v1/rescind-offer', { reason: 'Programme changed' }) as NextRequest,
      positionParams('pos-v1')
    )
    expect(res.status).toBe(200)

    expect(events()).toEqual([
      expect.objectContaining({
        actor_type: 'admin',
        actor_id: ADMIN.id,
        entity_id: row.id,
        action: 'offer.rescinded',
        after: expect.objectContaining({ status: 'rescinded', reason: 'Programme changed', seat_released: true }),
      }),
    ])
  })
})

describe('chairs', () => {
  it('a direct assignment records position.assigned, and resolves the chair\'s offers', async () => {
    const own = q().sendOffer('v1', R.v1[1], { supersede: false })
    const other = q().sendOffer('v1', R.v1[0], { supersede: false })

    const res = await assignPOST(
      post('/api/positions/pos-v1/assign', { musicianId: R.v1[1] }) as NextRequest,
      positionParams('pos-v1')
    )
    expect(res.status).toBe(200)

    expect(eventsFor('pos-v1')).toEqual([
      expect.objectContaining({
        actor_type: 'admin',
        actor_id: ADMIN.id,
        entity_type: 'position',
        action: 'position.assigned',
        before: { status: 'offered', musician_id: null },
        after: { status: 'confirmed', musician_id: R.v1[1], source: 'direct_assign' },
      }),
    ])
    expect(eventsFor(own.id)).toEqual([expect.objectContaining({ action: 'offer.accepted' })])
    expect(eventsFor(other.id)).toEqual([
      expect.objectContaining({ action: 'offer.superseded', after: expect.objectContaining({ reason: 'chair_assigned' }) }),
    ])
  })

  it('unassigning records position.unassigned and the released acceptance', async () => {
    const row = q().sendOffer('v1', R.v1[0])
    await respond(row, 'accept')
    q().hydrate()

    const res = await unassignPOST(post('/api/positions/pos-v1/unassign') as NextRequest, positionParams('pos-v1'))
    expect(res.status).toBe(200)
    expect(q().chair('v1')).toMatchObject({ musician_id: null, status: 'vacant' })

    expect(eventsFor('pos-v1')).toEqual([
      expect.objectContaining({
        actor_type: 'admin',
        action: 'position.unassigned',
        before: { status: 'confirmed', musician_id: R.v1[0] },
        after: { status: 'vacant', musician_id: null },
      }),
    ])
    expect(eventsFor(row.id).map((e) => e.action)).toEqual(['offer.accepted', 'offer.released'])
  })

  it('auto-populate (seating from a book) records each seated chair', async () => {
    q().db.tables.project_positions = []
    const res = await autoPopulatePUT(
      new NextRequest('http://localhost:3000/api/projects/proj-wedding/auto-populate', {
        method: 'PUT',
        body: JSON.stringify({
          positions: [
            { instrument_id: 'inst-violin', chair_number: 1, musician_id: R.v1[0] },
            { instrument_id: 'inst-violin', chair_number: 2, musician_id: null },
          ],
        }),
      }),
      { params: Promise.resolve({ projectId: 'proj-wedding' }) }
    )
    expect(res.status).toBe(200)

    expect(events()).toEqual([
      expect.objectContaining({
        organization_id: ORG,
        actor_type: 'admin',
        entity_type: 'position',
        action: 'position.assigned',
        after: { status: 'confirmed', musician_id: R.v1[0], source: 'book' },
      }),
    ])
  })
})

describe('substitutions', () => {
  it('a sub request records substitution.requested by the musician', async () => {
    const { original, request } = await seatedWithSubRequest()

    expect(eventsFor(request.id)).toEqual([
      expect.objectContaining({
        actor_type: 'musician',
        actor_id: R.v1[0],
        entity_type: 'substitution_request',
        action: 'substitution.requested',
        after: expect.objectContaining({ status: 'pending_approval', offer_id: original.id }),
      }),
    ])
  })

  it('approval records substitution.approved and the substitute\'s offer going out', async () => {
    const { request } = await seatedWithSubRequest()
    const subOffer = await approve(request.id as string)

    expect(eventsFor(request.id).map((e) => e.action)).toEqual(['substitution.requested', 'substitution.approved'])
    expect(eventsFor(request.id)[1]).toMatchObject({
      actor_type: 'admin',
      actor_id: ADMIN.id,
      after: { status: 'approved', offer_id: subOffer.id },
    })
    expect(eventsFor(subOffer.id)).toEqual([
      expect.objectContaining({ action: 'offer.sent', after: expect.objectContaining({ substitution_request_id: request.id }) }),
    ])
  })

  it('an admin declining the request records substitution.declined', async () => {
    const { request } = await seatedWithSubRequest()
    const res = await subDeclinePOST(
      post(`/api/substitutions/${request.id}/decline`, { adminNotes: 'Find someone from the list' }),
      requestParams(request.id as string)
    )
    expect(res.status).toBe(200)

    expect(eventsFor(request.id)[1]).toMatchObject({
      actor_type: 'admin',
      action: 'substitution.declined',
      after: { status: 'declined', admin_notes: 'Find someone from the list' },
    })
  })

  it('the substitute accepting records the fill and the original musician\'s release', async () => {
    const { original, request } = await seatedWithSubRequest()
    const subOffer = await approve(request.id as string)
    await respond(subOffer, 'accept')

    expect(eventsFor(subOffer.id).map((e) => e.action)).toEqual(['offer.sent', 'offer.accepted'])
    expect(eventsFor(request.id).at(-1)).toMatchObject({ action: 'substitution.filled', after: { status: 'filled' } })
    expect(eventsFor(original.id).at(-1)).toMatchObject({
      action: 'offer.released',
      after: expect.objectContaining({ reason: 'substitute_accepted', musician_id: R.v1[0] }),
    })
  })

  it('the substitute declining records the end of that attempt, and the chair is not freed', async () => {
    const { request } = await seatedWithSubRequest()
    const subOffer = await approve(request.id as string)
    await respond(subOffer, 'decline')

    expect(eventsFor(request.id).at(-1)).toMatchObject({
      actor_type: 'musician',
      action: 'substitution.ended',
      after: { status: 'sub_declined', reason: 'declined' },
    })
    expect(eventsFor(subOffer.id).at(-1)!.after).toMatchObject({ status: 'declined', seat_released: false })
  })

  it('the substitute\'s offer running out records the end of the attempt as the system', async () => {
    const { request } = await seatedWithSubRequest()
    const subOffer = await approve(request.id as string)
    q().db.row('contract_offers', subOffer.id as string)!.expires_at = PAST
    q().hydrate()

    await runCron()

    expect(eventsFor(request.id).at(-1)).toMatchObject({
      actor_type: 'system',
      action: 'substitution.ended',
      after: { status: 'sub_declined', reason: 'expired' },
    })
    expect(eventsFor(subOffer.id).at(-1)).toMatchObject({ action: 'offer.expired', after: expect.objectContaining({ seat_released: false }) })
  })

  it('rescinding the substitute\'s offer records the end of the attempt', async () => {
    const { request } = await seatedWithSubRequest()
    await approve(request.id as string)
    await rescindPOST(post('/api/positions/pos-v1/rescind-offer', {}) as NextRequest, positionParams('pos-v1'))

    expect(eventsFor(request.id).at(-1)).toMatchObject({
      actor_type: 'admin',
      action: 'substitution.ended',
      after: { status: 'sub_declined', reason: 'rescinded' },
    })
  })
})

describe('the history never gets in the way', () => {
  /** Make every write to staffing_events fail, as it would before migration 092 is applied. */
  const breakHistory = () => {
    q().db.beforeOp = (entry) => {
      if (entry.table === 'staffing_events') throw new Error('relation "staffing_events" does not exist')
    }
  }

  it('an accept still lands, and the musician is still emailed', async () => {
    const row = q().sendOffer('v1', R.v1[0])
    breakHistory()

    const res = await respond(row, 'accept')

    expect(res.status).toBe(307)
    expect(q().chair('v1')).toMatchObject({ musician_id: R.v1[0], status: 'confirmed' })
    const email = await import('@/lib/email/send')
    expect(email.sendOfferAcceptedEmail).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('staffing events not recorded (offer.accepted'), expect.any(Error))
  })

  it('an admin rescind still succeeds', async () => {
    q().sendOffer('v1', R.v1[0])
    breakHistory()

    const res = await rescindPOST(post('/api/positions/pos-v1/rescind-offer', {}) as NextRequest, positionParams('pos-v1'))

    expect(res.status).toBe(200)
    expect(q().chair('v1').status).toBe('vacant')
  })

  it('the expire cron still expires and reports', async () => {
    q().sendOffer('viola', R.viola[0], { expiresAt: PAST })
    breakHistory()

    expect((await (await runCron()).json()).expired).toBe(1)
  })
})
