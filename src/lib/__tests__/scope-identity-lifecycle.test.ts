import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { ReactElement } from 'react'
import { NextRequest, NextResponse } from 'next/server'
import {
  buildQuartet,
  cascadeConstraints,
  QUARTET_ORG,
  QUARTET_PROJECT,
  QUARTET_RANKING as R,
  type ChairKey,
  type QuartetFixture,
} from './helpers/quartet-fixture'
import type { Row } from './helpers/supabase-mock'

/**
 * Which services a chair works (migration 098, src/lib/staffing/scope.ts),
 * through every route that tells ONE person about their gig, pays them, or
 * changes their offer. Each scenario runs three times on the quartet wedding:
 *
 *   today     the rows as every quartet company has them: no scope fields at
 *             all (a database without 098 reads exactly like this)
 *   all       every chair explicitly scope_mode 'all', AND a stray
 *             position_services row (Cocktail Hour) that 'all' must ignore
 *   selected  every chair limited to Cocktail Hour, on a gig that also has a
 *             rehearsal the day before (the database only allows this in an
 *             organization with call_scoped_requirements on; here it proves
 *             the route really reads the scope)
 *
 * 'all' must produce EXACTLY what 'today' produces: every email asked for,
 * with every argument; every email_logs row; every read and write the route
 * made, with its filters and payload; the offers and chairs it leaves behind.
 * That is the quartet-identity proof for each adopter (owner decision W7).
 * 'selected' must show the scope took effect.
 */

const NOW = new Date('2026-11-05T18:00:00.000Z') // noon in Chicago, two days before the wedding
const TZ = QUARTET_ORG.timezone
const REHEARSAL = { id: 'svc-rehearsal', project_id: QUARTET_PROJECT.id, name: 'Rehearsal', start_time: '2026-11-06T20:00:00Z', base_pay: 80, leader_fee: null }

const state = vi.hoisted(() => ({ q: undefined as unknown as QuartetFixture }))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => state.q.db,
  createClient: async () => ({
    from: (table: string) => state.q.db.from(table),
    auth: { getUser: async () => ({ data: { user: { id: 'user-admin', email: 'admin@example.com' } } }) },
  }),
  getOrgAdminEmails: vi.fn(async () => ['admin@example.com']),
}))

vi.mock('@/lib/api-helpers', () => ({
  requireOrgAdmin: async () => ({ supabase: state.q.db, membership: { organization_id: QUARTET_ORG.id }, error: null }),
  apiSuccess: (data: unknown, status = 200) => NextResponse.json(data, { status }),
  apiError: (message: string, status = 400) => NextResponse.json({ error: message }, { status }),
  serverError: (message: string) => NextResponse.json({ error: message }, { status: 500 }),
  getOrgPlan: vi.fn(async () => null),
  // The real music template, as getOrgVertical returns for every organization today.
  getOrgVertical: vi.fn(async () => (await import('@/lib/verticals')).VERTICALS.music_contractor),
}))

// Every sender is replaced (nothing can be sent) and records its arguments.
// The subject-date formatter is the real one, so a different first service shows.
vi.mock('@/lib/email/send', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>()
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(real)) {
    out[key] =
      key === 'formatPerformanceDateForSubject'
        ? vi.fn(real[key] as (...a: unknown[]) => unknown)
        : typeof real[key] === 'function'
          ? vi.fn(async () => ({ id: key, subject: key, emailHtml: `<p>${key}</p>` }))
          : real[key]
  }
  return out
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

import * as email from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { createOffer } from '@/lib/staffing/offers'
import { POST as sendEmailPOST } from '@/app/api/offers/send-email/route'
import { POST as previewPOST } from '@/app/api/offers/preview-email/route'
import { POST as sendReminderPOST } from '@/app/api/offers/send-reminder/route'
import { GET as calendarGET } from '@/app/api/offers/[offerId]/calendar/route'
import { POST as acceptPOST } from '@/app/api/gig/[token]/accept/route'
import { POST as declinePOST } from '@/app/api/gig/[token]/decline/route'
import { POST as requestSubPOST } from '@/app/api/gig/[token]/request-sub/route'
import { POST as dropPOST } from '@/app/api/gig/[token]/drop/route'
import { POST as approvePOST } from '@/app/api/substitutions/[requestId]/approve/route'
import { POST as subDeclinePOST } from '@/app/api/substitutions/[requestId]/decline/route'
import { POST as rescindPOST } from '@/app/api/positions/[positionId]/rescind-offer/route'
import { POST as unassignPOST } from '@/app/api/positions/[positionId]/unassign/route'
import { POST as generatePOST } from '@/app/api/payments/generate/route'
import { GET as expireGET } from '@/app/api/cron/expire-offers/route'
import { GET as remindersGET } from '@/app/api/cron/offer-reminders/route'
import GigPage from '@/app/gig/[token]/page'

type Variant = 'today' | 'all' | 'selected'

const q = () => state.q
const HOUR = 60 * 60 * 1000

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  process.env.CRON_SECRET = 'test-secret'
  delete process.env.CRON_ENABLED
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** A fresh quartet, with its chairs' scope set for the variant. */
function setUp(variant: Variant) {
  vi.clearAllMocks()
  state.q = buildQuartet()
  state.q.db.constraint = cascadeConstraints
  if (variant === 'today') return
  if (variant === 'selected') q().db.tables.services.push({ ...REHEARSAL })
  for (const p of q().db.tables.project_positions) {
    p.scope_mode = variant
    p.position_services = [{ service_id: 'svc-cocktail' }]
  }
  q().db.tables.position_services = q().db.tables.project_positions.map((p) => ({ project_position_id: p.id, service_id: 'svc-cocktail' }))
  q().hydrate()
}

/** Seat a musician the way an accepted offer leaves it. */
function seat(key: ChairKey, musicianId: string, opts: { customPay?: number | null } = {}): Row {
  const offer = q().sendOffer(key, musicianId, opts)
  offer.status = 'accepted'
  offer.responded_at = NOW.toISOString()
  const chair = q().chair(key)
  chair.musician_id = musicianId
  chair.status = 'confirmed'
  q().hydrate()
  return offer
}

const json = (url: string, body?: unknown) =>
  new NextRequest(`http://localhost:3000${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const cron = (path: string) => new NextRequest(`http://localhost:3000${path}`, { headers: { authorization: 'Bearer test-secret' } })
const params = <T,>(p: T) => ({ params: Promise.resolve(p) })

const EMBEDS = ['musician', 'instrument', 'project', 'projects', 'project_position', 'contract_offers', 'requesting_musician', 'service']
const SCOPE = ['scope_mode', 'position_services']
const strip = (row: Row, drop: string[]) => Object.fromEntries(Object.entries(row).filter(([k]) => !drop.includes(k)))

/** Everything a route did that anyone could notice, with random tokens blanked. */
function observed(result: unknown) {
  const calls: { kind: string; order: number; args: unknown }[] = []
  for (const [kind, fn] of Object.entries(email)) {
    if (!vi.isMockFunction(fn) || !kind.startsWith('send')) continue
    fn.mock.calls.forEach((args, i) => calls.push({ kind, order: fn.mock.invocationCallOrder[i], args: args[0] }))
  }
  const out = {
    result,
    emails: calls.sort((a, b) => a.order - b.order).map(({ kind, args }) => ({ kind, args })),
    emailLogs: vi.mocked(logEmail).mock.calls.map((c) => c[0]),
    queries: q().db.log.map((e) => ({ table: e.table, operation: e.operation, filters: e.filters, payload: e.payload })),
    offers: q().db.tables.contract_offers.map((o) => strip(o, EMBEDS)),
    chairs: q().db.tables.project_positions.map((p) => strip(p, [...EMBEDS, ...SCOPE])),
    requests: (q().db.tables.substitution_requests || []).map((r) => strip(r, EMBEDS)),
    payments: q().db.tables.payments,
  }
  return JSON.parse(JSON.stringify(out).replace(/\b[0-9a-f]{64}\b/g, '<token>'))
}

/** Run a scenario on a fresh quartet in this variant; what it did. */
async function outcome(variant: Variant, scenario: () => Promise<unknown>) {
  setUp(variant)
  q().db.log = []
  const result = await scenario()
  return observed(result)
}

const argsOf = (out: ReturnType<typeof observed>, kind: string) =>
  out.emails.filter((e: { kind: string }) => e.kind === kind).map((e: { args: Record<string, unknown> }) => e.args)
const serviceNames = (args: { services?: { name: string }[] }) => (args.services || []).map((s) => s.name)
const COCKTAIL_DATE = (email.formatPerformanceDateForSubject as (iso: string, tz?: string) => string)('2026-11-07T22:30:00Z', TZ)

/** A route's response, reduced to what the caller sees. */
async function seen(res: Response) {
  const type = res.headers.get('content-type') || ''
  return { status: res.status, location: res.headers.get('location'), body: type.includes('json') ? await res.json() : await res.text() }
}

// ---------------------------------------------------------------------------
// The scenarios: one per adopter
// ---------------------------------------------------------------------------

const scenarios: Record<string, () => Promise<unknown>> = {
  'offer email (send-email)': async () => {
    const offer = q().sendOffer('v1', R.v1[0])
    return seen(await sendEmailPOST(json('/api/offers/send-email', { offerId: offer.id })))
  },
  'making an offer (createOffer: expiry, terms snapshot, email)': async () => {
    q().db.tables.musician_instruments = []
    return createOffer(q().db as never, 'user-admin', { positionId: 'pos-v1', musicianId: R.v1[0], expiry: { kind: 'none' } })
  },
  'offer preview': async () => seen(await previewPOST(json('/api/offers/preview-email', { positionId: 'pos-v1', musicianId: R.v1[0] }))),
  'accept + confirmation email': async () => {
    const offer = q().sendOffer('v1', R.v1[0])
    return seen(await acceptPOST(json(`/api/gig/${offer.token}/accept`), params({ token: offer.token as string })))
  },
  'decline': async () => {
    const offer = q().sendOffer('v2', R.v2[0])
    return seen(await declinePOST(json(`/api/gig/${offer.token}/decline`), params({ token: offer.token as string })))
  },
  'expire cron': async () => {
    q().sendOffer('viola', R.viola[0], { expiresAt: new Date(NOW.getTime() - HOUR).toISOString() })
    return seen(await expireGET(cron('/api/cron/expire-offers')))
  },
  'offer reminders cron': async () => {
    const offer = q().sendOffer('cello', R.cello[0], { expiresAt: new Date(NOW.getTime() + 11 * HOUR).toISOString() })
    offer.sent_at = new Date(NOW.getTime() - 48 * HOUR).toISOString()
    return seen(await remindersGET(cron('/api/cron/offer-reminders')))
  },
  'admin reminder (send-reminder)': async () => {
    const offer = q().sendOffer('v2', R.v2[0])
    return seen(await sendReminderPOST(json('/api/offers/send-reminder', { offerId: offer.id })))
  },
  'withdraw an offer (rescind)': async () => {
    q().sendOffer('v2', R.v2[0])
    return seen(await rescindPOST(json('/api/positions/pos-v2/rescind-offer', { reason: 'Changed plans' }), params({ positionId: 'pos-v2' })))
  },
  'unassign': async () => {
    seat('viola', R.viola[0])
    return seen(await unassignPOST(json('/api/positions/pos-viola/unassign'), params({ positionId: 'pos-viola' })))
  },
  'substitute request, approval and decline': async () => {
    const offer = seat('cello', R.cello[0])
    const body = { reason: 'Sick', subFirstName: 'Sam', subLastName: 'Sub', subEmail: 'sam@example.com', subInstrumentId: 'inst-cello' }
    const asked = await seen(await requestSubPOST(json(`/api/gig/${offer.token}/request-sub`, body), params({ token: offer.token as string })))
    q().hydrate()
    const requestId = q().db.tables.substitution_requests[0]?.id as string
    const approved = await seen(await approvePOST(json(`/api/substitutions/${requestId}/approve`), params({ requestId })))
    // A second request on another chair, declined.
    const other = seat('v2', R.v2[0])
    await requestSubPOST(json(`/api/gig/${other.token}/request-sub`, { ...body, subInstrumentId: 'inst-violin' }), params({ token: other.token as string }))
    q().hydrate()
    const secondId = q().db.tables.substitution_requests[1]?.id as string
    const declined = await seen(await subDeclinePOST(json(`/api/substitutions/${secondId}/decline`, { adminNotes: 'No' }), params({ requestId: secondId })))
    return { asked, approved, declined }
  },
  'generate payments': async () => {
    seat('v1', R.v1[0])
    seat('v2', R.v2[0], { customPay: 300 })
    seat('viola', R.viola[0])
    seat('cello', R.cello[0])
    return seen(await generatePOST(json('/api/payments/generate', { projectId: QUARTET_PROJECT.id })))
  },
  'gig page': async () => {
    const offer = q().sendOffer('v1', R.v1[0])
    const el = (await GigPage({ params: Promise.resolve({ token: offer.token as string }) })) as ReactElement<Record<string, unknown>>
    return el.props
  },
  'calendar download': async () => {
    const offer = seat('v1', R.v1[0])
    const ics = await calendarGET(new NextRequest(`http://localhost:3000/api/offers/${offer.id}/calendar?token=${offer.token}`), params({ offerId: offer.id as string }))
    const google = await calendarGET(
      new NextRequest(`http://localhost:3000/api/offers/${offer.id}/calendar?token=${offer.token}&format=google`),
      params({ offerId: offer.id as string })
    )
    return { ics: await seen(ics), google: await seen(google) }
  },
  'auto-offer after a decline (candidates, conflicts, cascade terms and email)': async () => {
    q().db.tables.organizations = [{ ...QUARTET_ORG, auto_cascade: true, allow_worker_drop: false }]
    // The candidate read filters on the musician's instruments (a nested column
    // the in-memory fake cannot follow); give each row the value it filters on.
    for (const m of q().db.tables.musicians) {
      m['musician_instruments.instrument_id'] = m.id.startsWith('mus-v') && !m.id.startsWith('mus-viola') ? 'inst-violin' : `inst-${m.id.split('-')[1]}`
      m.competing_schedules = []
    }
    // First in line after the decline (call order 0) is booked on another gig
    // from 3 to 4 pm in Chicago: it clashes with the Ceremony (3 pm, no end time
    // so three hours), not with Cocktail Hour (4:30 pm).
    const first = q().db.row('musicians', R.v2[1])!
    first.call_order = 0
    q().db.tables.projects.push({ ...QUARTET_PROJECT, id: 'proj-gala', name: 'Gala' })
    q().db.tables.services.push({ id: 'svc-gala', project_id: 'proj-gala', name: 'Gala', start_time: '2026-11-07T21:00:00Z', end_time: '2026-11-07T22:00:00Z' })
    q().db.tables.project_positions.push({ id: 'pos-gala', project_id: 'proj-gala', instrument_id: 'inst-violin', chair_number: 1, musician_id: R.v2[1], status: 'confirmed' })
    q().db.tables.contract_offers.push({ id: 'offer-gala', token: 'tok-gala', status: 'accepted', project_position_id: 'pos-gala', musician_id: R.v2[1], expires_at: null })
    seat('v1', R.v1[0])
    const offer = q().sendOffer('v2', R.v2[0])
    return seen(await declinePOST(json(`/api/gig/${offer.token}/decline`), params({ token: offer.token as string })))
  },
  "I can't make it (worker drop)": async () => {
    q().db.tables.organizations = [{ ...QUARTET_ORG, auto_cascade: false, allow_worker_drop: true }]
    const offer = seat('v2', R.v2[0])
    const form = new FormData()
    form.set('reason', 'Family emergency')
    const req = new Request(`http://localhost:3000/api/gig/${offer.token}/drop`, { method: 'POST', body: form })
    return seen(await dropPOST(req, params({ token: offer.token as string })))
  },
}

describe("a chair on the whole gig ('all') is exactly today, route by route", () => {
  for (const [name, scenario] of Object.entries(scenarios)) {
    it(name, async () => {
      const today = await outcome('today', scenario)
      const all = await outcome('all', scenario)
      expect(all).toEqual(today)
      // The scenario did something: an email, a write, or a page.
      expect(today.emails.length + today.queries.filter((x: { operation: string }) => x.operation !== 'select').length + (today.result ? 1 : 0)).toBeGreaterThan(0)
    })
  }
})

describe("a chair limited to Cocktail Hour ('selected') is told, paid and checked for Cocktail Hour only", () => {
  it('offer email: lists only its services, priced from the first of them', async () => {
    const out = await outcome('selected', scenarios['offer email (send-email)'])
    const [offerEmail] = argsOf(out, 'sendContractOfferEmail')
    expect(serviceNames(offerEmail)).toEqual(['Cocktail Hour'])
    expect(offerEmail.payAmount).toBe(100) // Cocktail Hour's rate; no leader fee is set on it
  })

  it('making an offer: the terms snapshot records only its services, and "no expiration" ends at ITS first service', async () => {
    const out = await outcome('selected', scenarios['making an offer (createOffer: expiry, terms snapshot, email)'])
    const rpc = out.queries.find((x: { operation: string; table: string }) => x.operation === 'rpc' && x.table === 'create_offer')
    expect(rpc.payload.p_terms_snapshot.services.map((s: { id: string }) => s.id)).toEqual(['svc-cocktail'])
    expect(rpc.payload.p_expires_at).toBe('2026-11-07T22:30:00.000Z')
    const today = await outcome('today', scenarios['making an offer (createOffer: expiry, terms snapshot, email)'])
    const rpcToday = today.queries.find((x: { operation: string; table: string }) => x.operation === 'rpc' && x.table === 'create_offer')
    expect(rpcToday.payload.p_expires_at).toBe('2026-11-07T21:00:00.000Z')
  })

  it('offer preview: only its services', async () => {
    const out = await outcome('selected', scenarios['offer preview'])
    expect(out.result.body.html).toContain('Cocktail Hour')
    expect(out.result.body.html).not.toContain('Rehearsal')
    expect(out.result.body.html).not.toContain('Ceremony')
  })

  it('accept: the confirmation lists only its services, dated by the first of them', async () => {
    const out = await outcome('selected', scenarios['accept + confirmation email'])
    expect(serviceNames(argsOf(out, 'sendOfferAcceptedEmail')[0])).toEqual(['Cocktail Hour'])
    expect(argsOf(out, 'sendAdminOfferResponseEmail')[0].performanceDate).toBe(COCKTAIL_DATE)
  })

  it.each(['decline', 'expire cron', 'offer reminders cron', 'admin reminder (send-reminder)', 'withdraw an offer (rescind)', 'unassign', 'substitute request, approval and decline'])(
    '%s: every date in a subject is its first service (Cocktail Hour), not the gig\'s (the rehearsal)',
    async (name) => {
      const out = await outcome('selected', scenarios[name])
      const dates = out.emails.map((e: { args: { performanceDate?: string } }) => e.args.performanceDate).filter((d: unknown) => d !== undefined)
      expect(dates.length).toBeGreaterThan(0)
      for (const d of dates) expect(d).toBe(COCKTAIL_DATE)
    }
  )

  it('substitute approval: the substitute is offered only its services', async () => {
    const out = await outcome('selected', scenarios['substitute request, approval and decline'])
    expect(serviceNames(argsOf(out, 'sendContractOfferEmail')[0])).toEqual(['Cocktail Hour'])
  })

  it('generate payments: per-service pay for its services only; a whole-gig amount once, on its first service', async () => {
    const out = await outcome('selected', scenarios['generate payments'])
    const rows = out.queries.find((x: { operation: string; table: string }) => x.operation === 'insert' && x.table === 'payments').payload
    expect(rows).toEqual([
      expect.objectContaining({ project_position_id: 'pos-v1', service_id: 'svc-cocktail', amount: 100 }),
      expect.objectContaining({ project_position_id: 'pos-v2', service_id: 'svc-cocktail', amount: 300 }),
      expect.objectContaining({ project_position_id: 'pos-viola', service_id: 'svc-cocktail', amount: 100 }),
      expect.objectContaining({ project_position_id: 'pos-cello', service_id: 'svc-cocktail', amount: 100 }),
    ])
  })

  it('gig page: shows only its services', async () => {
    const out = await outcome('selected', scenarios['gig page'])
    expect(out.result.services.map((s: { id: string }) => s.id)).toEqual(['svc-cocktail'])
  })

  it('calendar: only its services', async () => {
    const out = await outcome('selected', scenarios['calendar download'])
    // One event per service, named by the service's id; Google gets the first.
    const uids = [...out.result.ics.body.matchAll(/UID:(svc-[a-z]+)-/g)].map((m: RegExpMatchArray) => m[1])
    expect(uids).toEqual(['svc-cocktail'])
    expect(out.result.google.location).toContain('20261107T223000Z')
    const today = await outcome('today', scenarios['calendar download'])
    expect([...today.result.ics.body.matchAll(/UID:(svc-[a-z]+)-/g)].map((m: RegExpMatchArray) => m[1])).toEqual(['svc-ceremony', 'svc-cocktail'])
  })

  it('auto-offer: a clash with a call the chair does not work is no clash; the offer and its snapshot are its services', async () => {
    const offered = (out: ReturnType<typeof observed>) =>
      out.queries.find((x: { operation: string; table: string }) => x.operation === 'rpc' && x.table === 'cascade_offer')?.payload
    const today = offered(await outcome('today', scenarios['auto-offer after a decline (candidates, conflicts, cascade terms and email)']))
    expect(today.p_musician_id).toBe(R.v1[1]) // first in line is booked during the Ceremony: passed over
    const out = await outcome('selected', scenarios['auto-offer after a decline (candidates, conflicts, cascade terms and email)'])
    const selected = offered(out)
    expect(selected.p_musician_id).toBe(R.v2[1]) // they only need to be free for Cocktail Hour, and are
    expect(selected.p_terms_snapshot.services.map((s: { id: string }) => s.id)).toEqual(['svc-cocktail'])
    expect(serviceNames(argsOf(out, 'sendContractOfferEmail')[0])).toEqual(['Cocktail Hour'])
  })

  it('calendar: a chair limited to no services has nothing to download (the gig description is not a fallback)', async () => {
    setUp('selected')
    for (const p of q().db.tables.project_positions) p.position_services = []
    const offer = seat('v1', R.v1[0])
    const res = await calendarGET(new NextRequest(`http://localhost:3000/api/offers/${offer.id}/calendar?token=${offer.token}`), params({ offerId: offer.id as string }))
    expect(res.status).toBe(404)
  })

  describe('a chair limited to no services (its last one deleted) is for nothing, and says so', () => {
    const worksNothing = (keys: string[], scenario: () => Promise<unknown>) => async () => {
      const ids = keys.map((k) => `pos-${k}`)
      for (const p of q().db.tables.project_positions) if (ids.includes(p.id as string)) p.position_services = []
      q().db.tables.position_services = q().db.tables.position_services.filter((ps) => !ids.includes(ps.project_position_id as string))
      return scenario()
    }

    it('making an offer is refused, before anything is written or sent', async () => {
      const out = await outcome('selected', worksNothing(['v1'], scenarios['making an offer (createOffer: expiry, terms snapshot, email)']))
      expect(out.result).toEqual(expect.objectContaining({ ok: false, status: 409, code: 'chair_works_nothing' }))
      expect(out.queries.filter((x: { operation: string }) => x.operation !== 'select')).toEqual([])
      expect(out.emails).toEqual([])
    })

    it('auto-offer skips it', async () => {
      const out = await outcome('selected', worksNothing(['v2'], scenarios['auto-offer after a decline (candidates, conflicts, cascade terms and email)']))
      expect(out.queries.some((x: { operation: string; table: string }) => x.operation === 'rpc' && x.table === 'cascade_offer')).toBe(false)
      expect(argsOf(out, 'sendContractOfferEmail')).toEqual([])
      expect(JSON.stringify(out.queries)).toContain('chair_works_nothing') // recorded as cascade.skipped, with the reason
    })

    it('generate payments names a confirmed chair with an agreed fee it cannot pay, instead of skipping it silently', async () => {
      const out = await outcome('selected', worksNothing(['v2'], scenarios['generate payments']))
      expect(out.result.body.chairs_without_services).toEqual(['pos-v2'])
      expect(out.result.body.message).toContain('1 confirmed chair(s) have an agreed fee but are not set to work any service')
      const rows = out.queries.find((x: { operation: string; table: string }) => x.operation === 'insert' && x.table === 'payments').payload
      expect(rows.map((r: { project_position_id: string }) => r.project_position_id)).toEqual(['pos-v1', 'pos-viola', 'pos-cello'])
      // Nothing to report: the reply is exactly as before.
      const plain = await outcome('selected', scenarios['generate payments'])
      expect(plain.result.body).not.toHaveProperty('chairs_without_services')
    })
  })

  it("I can't make it: the gig's rehearsal having started does not stop someone who only works Cocktail Hour", async () => {
    const run = async (variant: Variant) => {
      setUp(variant)
      const rehearsal = { ...REHEARSAL, start_time: new Date(NOW.getTime() - HOUR).toISOString() }
      q().db.tables.services = q().db.tables.services.filter((s) => s.id !== REHEARSAL.id).concat(rehearsal)
      q().hydrate()
      await scenarios["I can't make it (worker drop)"]()
      return q().offerFor('v2', R.v2[0]).status
    }
    expect(await run('today')).toBe('accepted') // the gig has started: no drop, as before
    expect(await run('all')).toBe('accepted')
    expect(await run('selected')).toBe('released') // their call has not
  })
})
