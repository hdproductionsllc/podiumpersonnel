import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { buildQuartet, QUARTET_RANKING, type QuartetFixture } from './helpers/quartet-fixture'
import type { Row } from './helpers/supabase-mock'

/**
 * CHARACTERIZATION tests for the offer cascade (Release 0, step A0.2;
 * target architecture section 6 item 1; scenario ids S* and risk ids R-* are
 * from audit C, "Offer cascade implementation trace").
 *
 * These pin what the code does TODAY, scenario by scenario, so the staffing
 * rearchitecture can be refactored against a net. Three kinds of test:
 *
 *   it(...)        behaviour that is correct now (including everything the A0.3
 *                  guards fixed) and must stay correct.
 *   it.fails(...)  the behaviour we WANT, written as the assertion. It passes
 *                  while the defect exists and goes red the day someone fixes
 *                  it, which is the prompt to delete the `.fails`.
 *   it.todo(...)   not expressible against the in-memory fake (needs Postgres).
 *
 * Already covered elsewhere, deliberately not repeated here:
 *   S1/S2/S4 accept races and replays ........ offer-lifecycle-behavior, rescind-guard
 *   S3, S6 (single-run) expire vs accept ..... cron-expire-behavior
 *   S7b decline into a held chair (R-2) ...... offer-lifecycle-behavior ("never evicts")
 *   S8 / S10 cancelled gig, deactivated ...... offer-lifecycle-behavior ("closed offer", R-5/R-9)
 *   R-4 expire vacate guard, R-7 sub expiry .. cron-expire-behavior
 *   R-6 expired/rescinded musician re-suggested next-candidate-seated (it.each)
 *   double approval of one sub request ....... substitution-guards
 *
 * New here: S13 viewed overwrite, S9 position delete, S11 two sub requests,
 * S12/R-14 send failure after supersede, S14/R-1/R-13 two live offers, double
 * cron run, and the cron's blindness to a cancelled gig.
 */

const state = vi.hoisted(() => ({
  q: undefined as unknown as QuartetFixture,
  user: null as unknown,
  sendOfferFails: false,
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
    // The one send that can be made to fail, to exercise the supersede-then-fail window.
    sendContractOfferEmail: vi.fn(async () => {
      if (state.sendOfferFails) throw new Error('Resend is down')
      return { id: 'contract-offer', subject: 'Offer', emailHtml: '<p>offer</p>' }
    }),
    sendAdminOfferSentEmail: sent('admin-offer-sent'),
    sendOfferAcceptedEmail: sent('offer-accepted'),
    sendOfferDeclinedEmail: sent('offer-declined'),
    sendAdminOfferResponseEmail: sent('admin-offer-response'),
    sendOfferExpiredEmail: sent('offer-expired'),
    sendOfferRescindedEmail: sent('offer-rescinded'),
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
vi.mock('@/lib/next-candidate', () => ({
  getNextCandidates: vi.fn(async () => ({ candidates: [], totalAvailable: 0 })),
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
// The gig page hands everything to a client component; only its server-side work is under test.
vi.mock('@/components/gig/gig-page-client', () => ({ GigPageClient: () => null }))

import GigPage from '@/app/gig/[token]/page'
import { POST as acceptPOST } from '@/app/api/gig/[token]/accept/route'
import { POST as declinePOST } from '@/app/api/gig/[token]/decline/route'
import { POST as requestSubPOST } from '@/app/api/gig/[token]/request-sub/route'
import { POST as sendEmailPOST } from '@/app/api/offers/send-email/route'
import { POST as rescindPOST } from '@/app/api/positions/[positionId]/rescind-offer/route'
import { POST as approvePOST } from '@/app/api/substitutions/[requestId]/approve/route'
import { GET as expireGET } from '@/app/api/cron/expire-offers/route'
import { logEmail } from '@/lib/email/log'
import * as email from '@/lib/email/send'

const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString()
const R = QUARTET_RANKING
const q = () => state.q

let errorSpy: MockInstance

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'test-secret'
  delete process.env.CRON_ENABLED
  state.q = buildQuartet()
  state.user = ADMIN
  state.sendOfferFails = false
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

async function respond(row: Row, action: 'accept' | 'decline') {
  q().hydrate()
  const route = action === 'accept' ? acceptPOST : declinePOST
  return route(post(`/api/gig/${row.token}/${action}`), tokenParams(row))
}

const sendEmail = (offerId: string) => sendEmailPOST(post('/api/offers/send-email', { offerId }) as NextRequest)

const rescind = (positionId: string) =>
  rescindPOST(post(`/api/positions/${positionId}/rescind-offer`, { reason: 'Programme changed' }) as NextRequest, {
    params: Promise.resolve({ positionId }),
  })

const runCron = () =>
  expireGET(new NextRequest('http://localhost:3000/api/cron/expire-offers', { headers: { authorization: 'Bearer test-secret' } }))

const mailCount = (fn: unknown) => vi.mocked(fn as () => unknown).mock.calls.length
const offerStatus = (id: unknown) => q().db.row('contract_offers', id as string)!.status

// ---------------------------------------------------------------------------
// S13 / R-3: the gig page's "viewed" write
// ---------------------------------------------------------------------------

describe('gig page marks an offer viewed (S13, audit R-3)', () => {
  beforeEach(() => {
    state.user = null // an ordinary musician arriving from the email link: no session
  })

  const visit = (row: Row) => GigPage({ params: Promise.resolve({ token: row.token as string }) })
  const viewedWrites = () => q().db.ops('contract_offers', 'update').filter((e) => (e.payload as Row).status === 'viewed')

  it('moves a pending offer to viewed on the first visit', async () => {
    const row = q().sendOffer('v1', R.v1[0])
    await visit(row)

    expect(offerStatus(row.id)).toBe('viewed')
    expect(q().db.row('contract_offers', row.id as string)!.viewed_at).toBeTruthy()
  })

  it('does not overwrite an accept that lands between the page load and the write', async () => {
    const row = q().sendOffer('v1', R.v1[0])
    // The musician's other tab (or a mail client prefetching the link) accepts
    // after the page has read "pending" but before it writes "viewed".
    q().db.beforeOp = (entry, db) => {
      if (entry.table === 'contract_offers' && entry.operation === 'update') {
        db.row('contract_offers', row.id as string)!.status = 'accepted'
        db.row('project_positions', 'pos-v1')!.musician_id = R.v1[0]
        db.row('project_positions', 'pos-v1')!.status = 'confirmed'
        db.beforeOp = undefined
      }
    }

    await visit(row)

    expect(offerStatus(row.id)).toBe('accepted')
    expect(q().chair('v1')).toMatchObject({ musician_id: R.v1[0], status: 'confirmed' })
    // The write is conditional on the offer still being pending.
    expect(viewedWrites()[0].filters).toContainEqual({ method: 'eq', args: ['status', 'pending'] })
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it.each(['declined', 'expired', 'rescinded', 'accepted'])('leaves a %s offer alone', async (status) => {
    const row = q().sendOffer('v1', R.v1[0])
    q().db.row('contract_offers', row.id as string)!.status = status

    await visit(row)

    expect(offerStatus(row.id)).toBe(status)
    expect(viewedWrites()).toHaveLength(0)
  })

  it('does not mark an offer on a cancelled gig as viewed', async () => {
    const row = q().sendOffer('v1', R.v1[0])
    q().db.row('projects', 'proj-wedding')!.status = 'cancelled'
    q().hydrate()

    await visit(row)

    expect(offerStatus(row.id)).toBe('pending')
  })

  it('does not mark it viewed when the organization\'s own staff is previewing', async () => {
    const row = q().sendOffer('v1', R.v1[0])
    state.user = ADMIN // a member of the organization, not the musician

    await visit(row)

    expect(offerStatus(row.id)).toBe('pending')
  })
})

// ---------------------------------------------------------------------------
// S9 / R-8: position deleted under a live offer
// ---------------------------------------------------------------------------

describe('a chair deleted while an offer is live (S9, audit R-8)', () => {
  // The delete is a browser-side `delete()` (project-positions.tsx:349) and the
  // cascade to contract_offers / substitution_requests is a foreign key
  // (migration 001:129,145). There is no route to drive and the in-memory fake
  // does not model foreign keys, so this needs the Postgres-backed layer
  // (target architecture section 6 item 2).
  it.todo('R-8: deleting a chair with a pending offer silently deletes the offer; the musician is not told and their link 404s')
  it.todo('R-8: deleting a chair with a pending substitution request deletes the request with it')
  it.todo('R-8: "Clear all" does the same for every chair on the project from stale client state')
})

// ---------------------------------------------------------------------------
// S11 / R-22 / R-11: two substitution requests for one chair
// ---------------------------------------------------------------------------

describe('two substitution requests on one chair (S11, audit R-22, R-11)', () => {
  /** Olive holds Violin 1; a second request lands while the first is being filed. */
  async function seatOlive() {
    const offer = q().sendOffer('v1', R.v1[0])
    expect((await respond(offer, 'accept')).status).toBeLessThan(400)
    return offer
  }

  const fileRequest = (offer: Row, sub = 'Sam One') =>
    requestSubPOST(
      post(`/api/gig/${offer.token}/request-sub`, {
        subFirstName: sub.split(' ')[0],
        subLastName: sub.split(' ')[1],
        subEmail: `${sub.split(' ')[0].toLowerCase()}@example.com`,
        subInstrumentId: 'inst-violin',
      }),
      tokenParams(offer)
    )

  const requests = () => q().db.tables.substitution_requests

  it('a second request after the first is refused', async () => {
    const olive = await seatOlive()
    expect((await fileRequest(olive)).status).toBe(200)

    const second = await fileRequest(olive, 'Tess Two')

    expect(second.status).toBe(400)
    expect(requests()).toHaveLength(1)
  })

  const raceDuplicate = (olive: Row) => {
    // Another tab's request commits after this one's duplicate check but before its insert.
    q().db.beforeOp = (entry, db) => {
      if (entry.table === 'substitution_requests' && entry.operation === 'insert') {
        db.tables.substitution_requests.push({
          id: 'sub-dup',
          project_position_id: 'pos-v1',
          requesting_musician_id: olive.musician_id,
          service_id: null,
          status: 'pending_approval',
          suggested_sub_name: 'Tess Two',
          suggested_sub_email: 'tess@example.com',
          suggested_sub_instrument_id: 'inst-violin',
        })
        db.beforeOp = undefined
      }
    }
  }

  it('two requests racing the duplicate check both get filed (check-then-insert, no unique index)', async () => {
    const olive = await seatOlive()
    raceDuplicate(olive)

    await fileRequest(olive)

    expect(requests().filter((r) => r.status === 'pending_approval')).toHaveLength(2)
  })

  it.fails('R-22: at most one open substitution request per musician per chair', async () => {
    const olive = await seatOlive()
    raceDuplicate(olive)

    await fileRequest(olive)

    expect(requests().filter((r) => ['pending_approval', 'approved'].includes(r.status as string))).toHaveLength(1)
  })

  /** Both requests approved, so two substitutes hold live offers on the one chair. */
  async function approveBoth(olive: Row) {
    raceDuplicate(olive)
    await fileRequest(olive)
    for (const request of requests()) {
      q().hydrate()
      const res = await approvePOST(post(`/api/substitutions/${request.id}/approve`), {
        params: Promise.resolve({ requestId: request.id as string }),
      })
      expect(res.status).toBe(200)
    }
    return q().liveOffers('v1').filter((o) => o.musician_id !== olive.musician_id)
  }

  it('the chair goes to whichever substitute accepts first; the other cannot take it', async () => {
    const olive = await seatOlive()
    const [subA, subB] = await approveBoth(olive)
    expect(subB).toBeDefined()

    await respond(subA, 'accept')
    await respond(subB, 'accept')

    expect(q().chair('v1').musician_id).toBe(subA.musician_id)
    expect(offerStatus(subA.id)).toBe('accepted')
    expect(offerStatus(olive.id)).toBe('released')
    // The loser never reaches the chair and is sent no confirmation.
    expect(mailCount(email.sendOfferAcceptedEmail)).toBe(2) // Olive's own accept, then the winning sub's
  })

  it.fails('R-11: the substitute who lost the race is not left holding a live "pending" offer', async () => {
    const olive = await seatOlive()
    const [subA, subB] = await approveBoth(olive)

    await respond(subA, 'accept')
    await respond(subB, 'accept')

    // Today the loser's offer reverts to pending, so their page shows Accept again.
    expect(offerStatus(subB.id)).not.toBe('pending')
  })

  it.fails('S11: the losing substitute\'s request does not stay "approved" forever', async () => {
    const olive = await seatOlive()
    const [subA, subB] = await approveBoth(olive)

    await respond(subA, 'accept')
    await respond(subB, 'accept')

    const loserRequest = requests().find((r) => r.offer_id === subB.id)!
    expect(loserRequest.status).not.toBe('approved')
  })
})

// ---------------------------------------------------------------------------
// S12 / R-14: the offer email fails after the previous offer was superseded
// ---------------------------------------------------------------------------

describe('send-email fails after superseding the previous offer (S12, audit R-14)', () => {
  /** Anna has a live offer; the admin offers Bea instead and the email send then fails. */
  async function replaceAnnaWithBea() {
    const anna = q().sendOffer('v1', R.v1[0])
    const bea = q().sendOffer('v1', R.v1[1], { supersede: false }) // the dialog inserts without superseding
    return { anna, bea }
  }

  it('a successful send leaves exactly one live offer on the chair', async () => {
    const { anna, bea } = await replaceAnnaWithBea()
    expect(q().liveOffers('v1')).toHaveLength(2) // both live until send-email runs

    const res = await sendEmail(bea.id as string)

    expect(res.status).toBe(200)
    expect(offerStatus(anna.id)).toBe('expired')
    expect(offerStatus(bea.id)).toBe('pending')
    expect(q().liveOffers('v1')).toHaveLength(1)
  })

  it('a send that throws returns 500, logs nothing, and leaves the new offer pending and undelivered', async () => {
    const { bea } = await replaceAnnaWithBea()
    state.sendOfferFails = true

    const res = await sendEmail(bea.id as string)

    expect(res.status).toBe(500)
    expect(offerStatus(bea.id)).toBe('pending')
    expect(q().chair('v1').status).toBe('offered')
    // No email_logs row for the failure, and no admin "offer sent" mail.
    expect(logEmail).not.toHaveBeenCalled()
    expect(mailCount(email.sendAdminOfferSentEmail)).toBe(0)
  })

  it('the previous offer has already been retired by the time the send fails (the window R-14 describes)', async () => {
    const { anna, bea } = await replaceAnnaWithBea()
    state.sendOfferFails = true

    await sendEmail(bea.id as string)

    expect(offerStatus(anna.id)).toBe('expired')
  })

  it.fails('R-14: a failed send does not kill the previous live offer', async () => {
    const { anna, bea } = await replaceAnnaWithBea()
    state.sendOfferFails = true

    await sendEmail(bea.id as string)

    // Anna was told nothing and still has a working link; she should still be live.
    expect(offerStatus(anna.id)).toBe('pending')
  })

  it('a musician with no email address is refused after the previous offer was already retired', async () => {
    const { anna, bea } = await replaceAnnaWithBea()
    q().db.row('musicians', R.v1[1])!.email = null
    q().hydrate()

    const res = await sendEmail(bea.id as string)

    expect(res.status).toBe(400)
    expect(offerStatus(anna.id)).toBe('expired')
  })

  it.fails('R-14: a musician with no email address is refused BEFORE anything is superseded', async () => {
    const { anna, bea } = await replaceAnnaWithBea()
    q().db.row('musicians', R.v1[1])!.email = null
    q().hydrate()

    await sendEmail(bea.id as string)

    expect(offerStatus(anna.id)).toBe('pending')
  })
})

// ---------------------------------------------------------------------------
// S14 / R-1 / R-13 / S1: two live offers on one chair
// ---------------------------------------------------------------------------

describe('two live offers on one chair (S14, audit R-1, R-13)', () => {
  /** The email toggle was off for the second offer, so nothing superseded the first. */
  function twoLive() {
    const anna = q().sendOffer('v1', R.v1[0])
    const bea = q().sendOffer('v1', R.v1[1], { supersede: false })
    expect(q().liveOffers('v1')).toHaveLength(2)
    return { anna, bea }
  }

  it('nothing in the database stops the second live offer being created', () => {
    twoLive() // R-1: no partial unique index; sendOffer mirrors the browser insert
    expect(q().liveOffers('v1').map((o) => o.musician_id)).toEqual([R.v1[0], R.v1[1]])
  })

  it('rescind cannot find "the" offer when there are two: 400, and neither is withdrawn', async () => {
    const { anna, bea } = twoLive()

    const res = await rescind('pos-v1')

    expect(res.status).toBe(400)
    expect(offerStatus(anna.id)).toBe('pending')
    expect(offerStatus(bea.id)).toBe('pending')
    expect(mailCount(email.sendOfferRescindedEmail)).toBe(0)
  })

  it.fails('R-13: an admin can rescind a chair that has two live offers', async () => {
    twoLive()

    const res = await rescind('pos-v1')

    expect(res.status).toBe(200)
  })

  it('the first to accept takes the chair; the second finds it filled and cannot take it', async () => {
    const { anna, bea } = twoLive()

    await respond(bea, 'accept')
    await respond(anna, 'accept')

    expect(q().chair('v1')).toMatchObject({ musician_id: R.v1[1], status: 'confirmed' })
    expect(offerStatus(bea.id)).toBe('accepted')
    expect(mailCount(email.sendOfferAcceptedEmail)).toBe(1)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it.fails('R-11: the one who lost is not sent back to a page offering Accept again', async () => {
    const { anna, bea } = twoLive()

    await respond(bea, 'accept')
    await respond(anna, 'accept')

    expect(offerStatus(anna.id)).not.toBe('pending')
  })

  it('the loser declining afterwards does not evict the winner (R-2 guard)', async () => {
    const { anna, bea } = twoLive()
    await respond(bea, 'accept')

    await respond(anna, 'decline')

    expect(offerStatus(anna.id)).toBe('declined')
    expect(q().chair('v1')).toMatchObject({ musician_id: R.v1[1], status: 'confirmed' })
  })
})

// ---------------------------------------------------------------------------
// Expire cron: run twice, and a gig that is already cancelled
// ---------------------------------------------------------------------------

describe('expire-offers cron run twice (S6)', () => {
  it('a second run after the first expires nothing and mails nobody again', async () => {
    const lapsed = q().sendOffer('viola', R.viola[0], { expiresAt: PAST })
    q().hydrate()

    expect((await (await runCron()).json()).expired).toBe(1)
    expect((await (await runCron()).json()).expired).toBe(0)

    expect(offerStatus(lapsed.id)).toBe('expired')
    expect(q().chair('viola')).toMatchObject({ musician_id: null, status: 'vacant' })
    expect(mailCount(email.sendOfferExpiredEmail)).toBe(1)
  })

  it('two runs at the same moment expire the offer once and mail the admins once', async () => {
    const lapsed = q().sendOffer('viola', R.viola[0], { expiresAt: PAST })
    q().hydrate()

    const runs = await Promise.all([runCron(), runCron()])
    const expired = (await Promise.all(runs.map((r) => r.json()))).map((b) => b.expired)

    expect(expired.sort()).toEqual([0, 1])
    expect(offerStatus(lapsed.id)).toBe('expired')
    expect(mailCount(email.sendOfferExpiredEmail)).toBe(1)
  })

  it('a run racing an accept never takes the chair from the musician who just accepted', async () => {
    const lapsed = q().sendOffer('viola', R.viola[0], { expiresAt: PAST })
    q().hydrate()
    q().db.beforeOp = (entry, db) => {
      if (entry.table === 'contract_offers' && entry.operation === 'update') {
        db.row('contract_offers', lapsed.id as string)!.status = 'accepted'
        db.row('project_positions', 'pos-viola')!.musician_id = R.viola[0]
        db.row('project_positions', 'pos-viola')!.status = 'confirmed'
        db.beforeOp = undefined
      }
    }

    await runCron()

    expect(offerStatus(lapsed.id)).toBe('accepted')
    expect(q().chair('viola')).toMatchObject({ musician_id: R.viola[0], status: 'confirmed' })
  })
})

describe('expire-offers cron on a cancelled gig (audit R-5, cron half)', () => {
  function cancelledGigWithLapsedOffer() {
    const lapsed = q().sendOffer('viola', R.viola[0], { expiresAt: PAST })
    q().db.row('projects', 'proj-wedding')!.status = 'cancelled'
    q().hydrate()
    return lapsed
  }

  it('still expires the offer and emails the admins about the cancelled gig', async () => {
    const lapsed = cancelledGigWithLapsedOffer()

    await runCron()

    expect(offerStatus(lapsed.id)).toBe('expired')
    expect(mailCount(email.sendOfferExpiredEmail)).toBe(1)
  })

  it.fails('R-5: admins are not mailed "offer expired" for a gig that was cancelled', async () => {
    cancelledGigWithLapsedOffer()

    await runCron()

    expect(mailCount(email.sendOfferExpiredEmail)).toBe(0)
  })

  it.todo('R-5: cancelling a gig retires its live offers and tells the musicians (cancel is a browser-side status write; no route to drive)')
})
