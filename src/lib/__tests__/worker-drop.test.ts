import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import type { ReactElement } from 'react'
import { render } from '@react-email/render'
import {
  buildQuartet,
  cascadeConstraints,
  QUARTET_CHAIRS,
  QUARTET_ORG,
  QUARTET_RANKING,
  type ChairKey,
  type QuartetFixture,
} from './helpers/quartet-fixture'
import type { Row } from './helpers/supabase-mock'

/**
 * Worker drop, "I can't make it" (src/lib/staffing/drop.ts, the route
 * POST /api/gig/[token]/drop, and the gig page), on the quartet fixture:
 *
 *   allow_worker_drop off (every music organization by default) -> nothing
 *     changes and the page offers no button
 *   on -> offer released, chair vacant, history, ONE logged admin email
 *   a second press, or two at once -> still one drop and one email
 *   the gig has started / not accepted / a substitute being arranged -> nothing
 *   auto-offer on -> the chair goes to the next person on the same terms
 *     (trigger 'dropped'), or "nobody left" once
 *   the page: the button only when allowed, and its own sentence afterwards
 *
 * Emails are mocks: nothing is sent anywhere.
 */

const NOW = new Date('2026-10-01T15:00:00.000Z')
const HOUR = 60 * 60 * 1000

const state = vi.hoisted(() => ({
  q: undefined as unknown as QuartetFixture,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => state.q.db,
  createClient: async () => ({
    from: (table: string) => state.q.db.from(table),
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
  getOrgAdminEmails: vi.fn(async () => ['admin@example.com', 'owner@example.com']),
}))

vi.mock('@/lib/api-helpers', () => ({
  getOrgPlan: vi.fn(async () => null),
  // The real music template, as getOrgVertical returns for every organization today.
  getOrgVertical: vi.fn(async () => (await import('@/lib/verticals')).VERTICALS.music_contractor),
}))

vi.mock('@/lib/email/send', () => {
  const sent = (id: string) => vi.fn(async () => ({ id, subject: id, emailHtml: `<p>${id}</p>` }))
  return {
    formatPerformanceDateForSubject: vi.fn(() => 'Nov 7'),
    sendContractOfferEmail: sent('contract-offer'),
    sendAdminOfferSentEmail: sent('admin-offer-sent'),
    sendAdminWorkerDroppedEmail: sent('admin-worker-dropped'),
    sendCascadeExhaustedEmail: sent('cascade-exhausted'),
    sendEmail: sent('generic'),
  }
})

vi.mock('@/lib/email/log', () => ({ hasRecentFailure: async () => false, logEmail: vi.fn(async () => {}) }))
vi.mock('@/lib/email/client', () => ({ logEmailConfig: vi.fn() }))
vi.mock('@/lib/venue-attach', () => ({ attachVenueDetails: vi.fn(async () => {}) }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/components/gig/gig-page-client', () => ({ GigPageClient: () => null }))

/**
 * The ranking engine's rules, as in auto-cascade-engine.test.ts: everyone on
 * the chair's list who is not seated, not holding an offer on the gig, and has
 * not had their turn at this chair (a dropped worker has), best first.
 */
vi.mock('@/lib/staffing/candidates', () => ({
  getNextCandidates: vi.fn(async (_db: unknown, positionId: string) => {
    const q = state.q
    const key = (Object.keys(QUARTET_CHAIRS) as ChairKey[]).find((k) => QUARTET_CHAIRS[k].id === positionId)!
    const t = q.db.tables
    const seated = new Set(t.project_positions.map((p) => p.musician_id).filter(Boolean))
    const busy = new Set(t.contract_offers.filter((o) => ['pending', 'viewed', 'accepted'].includes(o.status)).map((o) => o.musician_id))
    const tried = new Set(
      q.offers(key).filter((o) => ['declined', 'expired', 'superseded', 'rescinded', 'released'].includes(o.status)).map((o) => o.musician_id)
    )
    const candidates = QUARTET_RANKING[key]
      .filter((id) => !seated.has(id) && !busy.has(id) && !tried.has(id))
      .map((id) => q.db.row('musicians', id)!)
      .map((m) => ({
        id: m.id,
        first_name: m.first_name,
        last_name: m.last_name,
        email: m.email,
        call_order: m.call_order,
        is_leader: m.is_leader,
        has_conflict: false,
        conflict_reason: null,
      }))
    return { candidates, totalAvailable: candidates.length }
  }),
}))

import { POST as dropPOST } from '@/app/api/gig/[token]/drop/route'
import GigPage from '@/app/gig/[token]/page'
import { gigHasStarted, cleanDropReason } from '@/lib/staffing/drop'
import { describeGigOffer } from '@/lib/staffing/gig-offer-state'
import * as email from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { AdminWorkerDroppedEmail } from '@/lib/email/templates/admin-worker-dropped'
import { resolveVertical } from '@/lib/verticals'

const R = QUARTET_RANKING
const q = () => state.q
let errorSpy: MockInstance

function setOrg(flags: { allowWorkerDrop: boolean; autoCascade?: boolean }) {
  q().db.tables.organizations = [
    { ...QUARTET_ORG, vertical: 'events_av', allow_worker_drop: flags.allowWorkerDrop, auto_cascade: flags.autoCascade ?? false },
  ]
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  state.q = buildQuartet()
  state.q.db.constraint = cascadeConstraints
  for (const p of state.q.db.tables.project_positions) p.auto_cascade_disabled = false
  setOrg({ allowWorkerDrop: true })
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------

/** An accepted offer, as claim_chair leaves it: the musician holds the chair. */
function acceptedOffer(key: ChairKey, musicianId: string, opts: { customPay?: number | null; windowHours?: number } = {}): Row {
  const sentAt = new Date(Date.now() - 2 * HOUR)
  const row = q().sendOffer(key, musicianId, {
    customPay: opts.customPay ?? null,
    expiresAt: new Date(sentAt.getTime() + (opts.windowHours ?? 48) * HOUR).toISOString(),
  })
  row.sent_at = sentAt.toISOString()
  row.terms_snapshot = { pay: { custom_pay: opts.customPay ?? null, include_leader_fee: false, leader_fee_amount: null } }
  row.status = 'accepted'
  row.responded_at = new Date(Date.now() - HOUR).toISOString()
  Object.assign(q().db.row('project_positions', QUARTET_CHAIRS[key].id)!, { musician_id: musicianId, status: 'confirmed' })
  q().hydrate()
  return row
}

async function drop(row: Row, reason?: string) {
  q().hydrate()
  const body = new URLSearchParams(reason === undefined ? {} : { reason })
  const res = await dropPOST(new Request(`http://localhost:3000/api/gig/${row.token}/drop`, { method: 'POST', body }), {
    params: Promise.resolve({ token: row.token as string }),
  })
  // Every outcome goes back to the gig page, as a GET.
  expect(res.status).toBe(303)
  expect(res.headers.get('location')).toBe(`http://localhost:3000/gig/${row.token}`)
}

async function pageProps(row: Row): Promise<Record<string, unknown>> {
  q().hydrate()
  const el = (await GigPage({ params: Promise.resolve({ token: row.token as string }) })) as ReactElement<Record<string, unknown>>
  return el.props
}

const calls = (fn: unknown) => vi.mocked(fn as (...a: unknown[]) => unknown).mock.calls.map((c) => c[0] as Record<string, unknown>)
const events = (action: string) => (q().db.tables.staffing_events ?? []).filter((e) => e.action === action)
const cascadedFrom = (offerId: string) => q().db.tables.contract_offers.filter((o) => o.cascaded_from_offer_id === offerId)
const nothingHappened = (row: Row, key: ChairKey) => {
  expect(q().db.row('contract_offers', row.id)!.status).toBe('accepted')
  expect(q().chair(key)).toMatchObject({ musician_id: row.musician_id, status: 'confirmed' })
  expect(events('offer.released')).toHaveLength(0)
  expect(calls(email.sendAdminWorkerDroppedEmail)).toHaveLength(0)
  expect(logEmail).not.toHaveBeenCalled()
  expect(q().db.ops('contract_offers', 'update')).toHaveLength(0)
}

// ---------------------------------------------------------------------------

describe('with allow_worker_drop off (every music organization by default)', () => {
  it('a drop request changes nothing and emails nobody', async () => {
    setOrg({ allowWorkerDrop: false, autoCascade: true })
    const row = acceptedOffer('viola', R.viola[0])
    await drop(row, 'Sick')
    nothingHappened(row, 'viola')
    expect(q().db.ops(undefined, 'rpc')).toHaveLength(0)
  })

  it('the gig page offers no "I can\'t make it"', async () => {
    setOrg({ allowWorkerDrop: false })
    const props = await pageProps(acceptedOffer('viola', R.viola[0]))
    expect(props.canDrop).toBe(false)
  })

  it('or when the switch cannot be read (096 not applied)', async () => {
    q().db.tables.organizations = [{ ...QUARTET_ORG }]
    const props = await pageProps(acceptedOffer('viola', R.viola[0]))
    expect(props.canDrop).toBe(false)
  })
})

describe('with allow_worker_drop on and auto-offer off', () => {
  it('the gig page offers "I can\'t make it" to someone who accepted, before the gig', async () => {
    expect((await pageProps(acceptedOffer('viola', R.viola[0]))).canDrop).toBe(true)
    // Not to an offer still waiting on an answer.
    expect((await pageProps(q().sendOffer('cello', R.cello[0]))).canDrop).toBe(false)
  })

  it('releases the offer and the chair, records it, and emails the admins once (logged)', async () => {
    const row = acceptedOffer('viola', R.viola[0])
    await drop(row, '  Family emergency, so sorry.  ')

    expect(q().db.row('contract_offers', row.id)!.status).toBe('released')
    expect(q().chair('viola')).toMatchObject({ musician_id: null, status: 'vacant' })

    expect(events('offer.released')).toEqual([
      expect.objectContaining({
        actor_type: 'musician',
        actor_id: R.viola[0],
        entity_id: row.id,
        before: { status: 'accepted' },
        after: expect.objectContaining({ status: 'released', reason: 'dropped', seat_released: true, note: 'Family emergency, so sorry.' }),
      }),
    ])

    const mails = calls(email.sendAdminWorkerDroppedEmail)
    expect(mails).toHaveLength(1)
    expect(mails[0]).toMatchObject({
      to: ['admin@example.com', 'owner@example.com'],
      organizationId: QUARTET_ORG.id,
      musicianName: 'VIOLAA Player',
      instrument: 'Viola',
      reason: 'Family emergency, so sorry.',
      performanceDate: 'Nov 7',
    })
    // Auto-offer is off: the email asks the admin to fill it, and says nothing about auto-offer.
    expect(mails[0]).not.toHaveProperty('autoOffer')

    expect(vi.mocked(logEmail).mock.calls.map((c) => c[0])).toEqual([
      expect.objectContaining({ emailType: 'worker_dropped', offerId: row.id, recipientEmail: 'admin@example.com' }),
    ])

    // Nothing was offered to anyone, and the cascade left no trace.
    expect(q().db.tables.contract_offers.filter((o) => o.status === 'pending')).toHaveLength(0)
    expect(calls(email.sendContractOfferEmail)).toHaveLength(0)
    expect(events('cascade.skipped')).toHaveLength(0)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('with no note, there is no note', async () => {
    const row = acceptedOffer('viola', R.viola[0])
    await drop(row)
    expect(events('offer.released')[0].after).not.toHaveProperty('note')
    expect(calls(email.sendAdminWorkerDroppedEmail)[0].reason).toBeNull()
  })

  it('pressing it twice drops once and emails once', async () => {
    const row = acceptedOffer('viola', R.viola[0])
    await drop(row)
    await drop(row)
    expect(events('offer.released')).toHaveLength(1)
    expect(calls(email.sendAdminWorkerDroppedEmail)).toHaveLength(1)
  })

  it('two presses at the same moment: one drop, one email', async () => {
    const row = acceptedOffer('viola', R.viola[0])
    q().hydrate()
    await Promise.all([drop(row), drop(row)])
    expect(events('offer.released')).toHaveLength(1)
    expect(calls(email.sendAdminWorkerDroppedEmail)).toHaveLength(1)
    expect(q().chair('viola')).toMatchObject({ musician_id: null, status: 'vacant' })
  })

  it('once the gig has started: refused, and the page offers no button', async () => {
    const row = acceptedOffer('viola', R.viola[0])
    vi.setSystemTime(new Date('2026-11-07T21:00:00.000Z')) // the Ceremony's start
    await drop(row)
    nothingHappened(row, 'viola')
    expect((await pageProps(row)).canDrop).toBe(false)
  })

  it('an offer that was never accepted cannot be dropped', async () => {
    const row = q().sendOffer('viola', R.viola[0])
    await drop(row)
    expect(q().db.row('contract_offers', row.id)!.status).toBe('pending')
    expect(events('offer.released')).toHaveLength(0)
    expect(calls(email.sendAdminWorkerDroppedEmail)).toHaveLength(0)
  })

  it('a cancelled gig cannot be dropped (it is already off)', async () => {
    const row = acceptedOffer('viola', R.viola[0])
    q().db.row('projects', 'proj-wedding')!.status = 'cancelled'
    await drop(row)
    nothingHappened(row, 'viola')
  })

  it('while a substitute is being arranged, the database refuses it', async () => {
    const row = acceptedOffer('viola', R.viola[0])
    q().db.tables.substitution_requests.push({
      id: 'sub-1',
      project_position_id: QUARTET_CHAIRS.viola.id,
      requesting_musician_id: R.viola[0],
      status: 'pending_approval',
    })
    await drop(row)
    expect(q().db.row('contract_offers', row.id)!.status).toBe('accepted')
    expect(q().chair('viola')).toMatchObject({ musician_id: R.viola[0], status: 'confirmed' })
    expect(calls(email.sendAdminWorkerDroppedEmail)).toHaveLength(0)
  })

  it('a failed admin email never undoes the drop', async () => {
    vi.mocked(email.sendAdminWorkerDroppedEmail).mockRejectedValueOnce(new Error('resend down'))
    const row = acceptedOffer('viola', R.viola[0])
    await drop(row)
    expect(q().db.row('contract_offers', row.id)!.status).toBe('released')
    expect(q().chair('viola')).toMatchObject({ musician_id: null, status: 'vacant' })
  })

  it('without migration 096 (no worker_drop function): nothing changes', async () => {
    delete q().db.rpcs.worker_drop
    const row = acceptedOffer('viola', R.viola[0])
    await drop(row)
    nothingHappened(row, 'viola')
  })

  it('afterwards the page says they let the organization know', async () => {
    const row = acceptedOffer('viola', R.viola[0])
    await drop(row)
    const props = await pageProps(row)
    expect(props).toMatchObject({ offerStatus: 'released', releasedReason: 'dropped', canDrop: false })
    expect(
      describeGigOffer({
        offerStatus: props.offerStatus as string,
        releasedReason: props.releasedReason as string,
        workTerm: props.workTerm as string,
        organizationName: QUARTET_ORG.name,
      })
    ).toEqual({
      key: 'released',
      tone: 'neutral',
      message: "You let Test Quartet Co know you can't make it, so you are no longer booked for this project. No action is needed.",
    })
  })
})

describe('with auto-offer on: the cascade takes over', () => {
  it('offers the chair to the next person on the dropped offer\'s terms, and the admins\' email says so', async () => {
    setOrg({ allowWorkerDrop: true, autoCascade: true })
    const row = acceptedOffer('viola', R.viola[0], { customPay: 320, windowHours: 24 })
    await drop(row, 'Car broke down')

    const [next] = cascadedFrom(row.id)
    expect(next).toMatchObject({
      musician_id: R.viola[1],
      status: 'pending',
      custom_pay: 320,
      expires_at: new Date(NOW.getTime() + 24 * HOUR).toISOString(),
    })
    expect(next.terms_snapshot).toMatchObject({ cascade: { from_offer_id: row.id, trigger: 'dropped' } })
    expect(q().chair('viola')).toMatchObject({ musician_id: null, status: 'offered' })
    expect(calls(email.sendContractOfferEmail)).toEqual([expect.objectContaining({ to: `${R.viola[1]}@example.com` })])

    const [mail] = calls(email.sendAdminWorkerDroppedEmail)
    expect(mail.autoOffer).toEqual({
      kind: 'offered',
      musicianName: 'VIOLAB Player',
      expiresAt: next.expires_at,
      timezone: QUARTET_ORG.timezone,
    })
    expect(events('cascade.offered')).toHaveLength(1)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('nobody left: one "please pick someone" email, saying they dropped out', async () => {
    setOrg({ allowWorkerDrop: true, autoCascade: true })
    // Everyone else on the viola list has already had their turn.
    for (const id of R.viola.slice(1)) {
      const old = q().sendOffer('viola', id)
      old.status = 'declined'
    }
    const row = acceptedOffer('viola', R.viola[0])
    await drop(row)
    await drop(row)

    expect(cascadedFrom(row.id)).toHaveLength(0)
    expect(calls(email.sendCascadeExhaustedEmail)).toEqual([expect.objectContaining({ lastOutcome: 'dropped' })])
    expect(calls(email.sendAdminWorkerDroppedEmail)).toEqual([expect.objectContaining({ autoOffer: { kind: 'exhausted' } })])
  })

  it('a chair switched out of auto-offer is dropped but not offered on', async () => {
    setOrg({ allowWorkerDrop: true, autoCascade: true })
    q().db.row('project_positions', QUARTET_CHAIRS.viola.id)!.auto_cascade_disabled = true
    const row = acceptedOffer('viola', R.viola[0])
    await drop(row)
    expect(q().db.row('contract_offers', row.id)!.status).toBe('released')
    expect(cascadedFrom(row.id)).toHaveLength(0)
    expect(calls(email.sendAdminWorkerDroppedEmail)[0]).not.toHaveProperty('autoOffer')
  })
})

describe('the pieces', () => {
  it('gigHasStarted: at or after any service start', () => {
    const t = Date.parse('2026-11-07T21:00:00Z')
    expect(gigHasStarted(['2026-11-07T21:00:00Z'], t - 1)).toBe(false)
    expect(gigHasStarted(['2026-11-07T21:00:00Z'], t)).toBe(true)
    expect(gigHasStarted([null, undefined], t)).toBe(false)
  })

  it('cleanDropReason trims, caps at 1000 and drops empty notes', () => {
    expect(cleanDropReason('  hi  ')).toBe('hi')
    expect(cleanDropReason('   ')).toBeNull()
    expect(cleanDropReason(null)).toBeNull()
    expect(cleanDropReason('x'.repeat(1500))).toHaveLength(1000)
  })

  it('the admin email names the worker, their note and the position, in the vertical\'s words', async () => {
    const base = {
      organizationName: 'Stagehands Inc',
      projectName: 'Spring Gala',
      musicianName: 'Pat Doe',
      instrument: 'Audio A1',
      chairNumber: 1,
      totalChairs: 1,
      dashboardUrl: 'https://example.test/dashboard',
    }
    const html = await render(AdminWorkerDroppedEmail({ ...base, reason: 'Flu', terms: resolveVertical('theatre').terms }))
    expect(html).toContain('Pat Doe')
    expect(html).toContain('Flu')
    expect(html).toContain('Please offer this position to someone else')

    const auto = await render(
      AdminWorkerDroppedEmail({
        ...base,
        autoOffer: { kind: 'offered', musicianName: 'Sam Roe', expiresAt: '2026-10-02T15:00:00Z', timezone: 'America/Chicago' },
      })
    )
    expect(auto).toContain('Offered automatically')
    expect(auto).toContain('Sam Roe')
    expect(auto).not.toContain('Please offer this position to someone else')
  })
})
