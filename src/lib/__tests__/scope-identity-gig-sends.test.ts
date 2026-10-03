import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { ReactElement } from 'react'
import { NextRequest } from 'next/server'
import { QUARTET_CHAIRS, QUARTET_INSTRUMENTS, QUARTET_ORG, QUARTET_PROJECT, QUARTET_RANKING, QUARTET_SERVICES, type ChairKey } from './helpers/quartet-fixture'

/**
 * Which services a chair works (migration 098, src/lib/staffing/scope.ts),
 * through the senders that go to everyone on a gig at once: gig details and
 * their reminder, the "confirm you got the details" page, the staffing alert,
 * the pre-gig reminder and the after-gig pay summary. Same three runs as
 * scope-identity-lifecycle.test.ts:
 *
 *   today     no scope fields (every quartet row, and a database without 098)
 *   all       every chair explicitly 'all', plus a stray position_services row
 *   selected  every chair limited to Cocktail Hour, on a gig with a rehearsal
 *             the day before
 *
 * 'all' must equal 'today' in every email argument, log row, read and write.
 *
 * These routes read whole projects with embeds the in-memory fake cannot
 * filter, so this file uses a permissive fake: every read of a table returns
 * the rows given for it, every write is recorded.
 */

const NOW = new Date('2026-11-05T18:00:00.000Z') // two days before the wedding, noon in Chicago
const REHEARSAL = { id: 'svc-rehearsal', project_id: QUARTET_PROJECT.id, name: 'Rehearsal', start_time: '2026-11-06T20:00:00Z', base_pay: 80, leader_fee: null }

type Variant = 'today' | 'all' | 'selected'
type Tables = Record<string, unknown[]>

const state = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]>, log: [] as unknown[] }))

/** Every read answers with the table's rows; .single() the first. Writes are recorded and echoed back. */
function looseDb() {
  return {
    from(table: string) {
      let op = 'select'
      let payload: unknown
      let single = false
      let head = false
      const filters: unknown[] = []
      const result = () => {
        state.log.push({ table, op, filters, payload })
        if (op === 'insert') {
          const rows = (Array.isArray(payload) ? payload : [payload]).map((r, i) => ({ id: `${table}-${i + 1}`, token: `tok-${table}-${i + 1}`, ...(r as object) }))
          return { data: single ? rows[0] : rows, error: null }
        }
        if (op === 'update' || op === 'delete') return { data: [{ id: `${table}-written` }], error: null }
        const rows = state.tables[table] ?? []
        if (head) return { data: null, count: rows.length, error: null }
        return { data: single ? (rows[0] ?? null) : rows, error: null }
      }
      const c: Record<string, unknown> = {}
      for (const m of ['eq', 'neq', 'in', 'is', 'not', 'gt', 'gte', 'lt', 'lte', 'filter', 'order', 'limit', 'ilike']) {
        c[m] = (...args: unknown[]) => {
          filters.push([m, ...args])
          return c
        }
      }
      c.select = (_cols?: string, opts?: { head?: boolean }) => {
        if (opts?.head) head = true
        return c
      }
      c.insert = (rows: unknown) => ((op = 'insert'), (payload = rows), c)
      c.update = (patch: unknown) => ((op = 'update'), (payload = patch), c)
      c.delete = () => ((op = 'delete'), c)
      c.single = () => ((single = true), c)
      c.maybeSingle = () => ((single = true), c)
      c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej)
      return c
    },
    auth: { getUser: async () => ({ data: { user: { id: 'user-admin', email: 'admin@example.com' } } }) },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => looseDb(),
  createClient: async () => looseDb(),
  getOrgAdminEmails: vi.fn(async () => ['admin@example.com']),
}))

vi.mock('@/lib/api-helpers', () => ({
  getOrgPlan: vi.fn(async () => null),
}))

vi.mock('@/lib/email/send', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>()
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(real)) {
    out[key] = typeof real[key] === 'function' && key.startsWith('send')
      ? vi.fn(async () => ({ id: key, subject: key, emailHtml: `<p>${key}</p>` }))
      : real[key]
  }
  return out
})
vi.mock('@/lib/email/log', () => ({ hasRecentFailure: async () => false, logEmail: vi.fn(async () => {}) }))
vi.mock('@/lib/email/client', () => ({ logEmailConfig: vi.fn() }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/components/gig/confirm-details-client', () => ({ ConfirmDetailsClient: () => null }))

import * as email from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { sendGigDetailsToMusicians } from '@/lib/send-gig-details'
import { sendPaySummaryOnce } from '@/lib/after-gig/run'
import { POST as gigDetailsReminderPOST } from '@/app/api/projects/[projectId]/send-gig-details-reminder/route'
import { GET as staffingAlertsGET } from '@/app/api/cron/staffing-alerts/route'
import { GET as preGigGET } from '@/app/api/cron/pre-gig-reminders/route'
import ConfirmDetailsPage from '@/app/confirm-details/[token]/page'
import { POST as sendMusicPOST } from '@/app/api/projects/[projectId]/send-music/route'
import { POST as sendMusicReminderPOST } from '@/app/api/projects/[projectId]/send-music-reminder/route'

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

// ---------------------------------------------------------------------------
// The gig, as the routes read it: Violin 2 still open, the rest confirmed
// ---------------------------------------------------------------------------

const instrument = (id: string) => QUARTET_INSTRUMENTS.find((i) => i.id === id)!
function musician(key: ChairKey) {
  const id = QUARTET_RANKING[key][0]
  return { id, first_name: `${key.toUpperCase()}A`, last_name: 'Player', email: `${id}@example.com`, phone: null, is_leader: key === 'v1' }
}

function services(variant: Variant) {
  const list = [...QUARTET_SERVICES, ...(variant === 'selected' ? [REHEARSAL] : [])]
  return list.map((s) => ({
    ...s,
    service_type: 'performance',
    call_time: null,
    end_time: null,
    venue: 'Chapel',
    venue_id: null,
    venue_details: null,
    venue_2: null,
    venue_id_2: null,
    venue_2_details: null,
  }))
}

function chairs(variant: Variant, scopeOf: (key: ChairKey) => string[] = () => ['svc-cocktail']) {
  return (Object.keys(QUARTET_CHAIRS) as ChairKey[]).map((key) => {
    const open = key === 'v2'
    const m = musician(key)
    return {
      ...QUARTET_CHAIRS[key],
      project_id: QUARTET_PROJECT.id,
      status: open ? 'vacant' : 'confirmed',
      musician_id: open ? null : m.id,
      instrument: instrument(QUARTET_CHAIRS[key].instrument_id),
      musician: open ? null : m,
      contract_offers: open ? [] : [{ custom_pay: null, status: 'accepted' }],
      ...(variant === 'today'
        ? {}
        : { scope_mode: variant, position_services: (variant === 'all' ? ['svc-cocktail'] : scopeOf(key)).map((service_id) => ({ service_id })) }),
    }
  })
}

function project(variant: Variant, scopeOf?: (key: ChairKey) => string[]) {
  return {
    ...QUARTET_PROJECT,
    pay_summary_sent_at: null,
    gig_lead_musician_id: null,
    organization: { ...QUARTET_ORG, email_logo_url: null, email_brand_color: null, email_footer_text: null, disable_staffing_alerts: false },
    services: services(variant),
    project_positions: chairs(variant, scopeOf),
    gig_detail_sends: [],
    music_sends: [],
  }
}

/** What a run did: every email asked for, every log row, every read and write. */
async function observe(tables: Tables, run: () => Promise<unknown>) {
  vi.clearAllMocks()
  state.tables = tables
  state.log = []
  const result = await run()
  const calls: { kind: string; order: number; args: unknown }[] = []
  for (const [kind, fn] of Object.entries(email)) {
    if (!vi.isMockFunction(fn)) continue
    fn.mock.calls.forEach((args, i) => calls.push({ kind, order: fn.mock.invocationCallOrder[i], args: args[0] }))
  }
  return JSON.parse(
    JSON.stringify({
      result,
      emails: calls.sort((a, b) => a.order - b.order).map(({ kind, args }) => ({ kind, args })),
      emailLogs: vi.mocked(logEmail).mock.calls.map((c) => c[0]),
      queries: state.log,
    })
  )
}

const cron = (path: string) => new NextRequest(`http://localhost:3000${path}`, { headers: { authorization: 'Bearer test-secret' } })
async function seen(res: Response) {
  return { status: res.status, body: await res.json() }
}
const argsOf = (out: { emails: { kind: string; args: Record<string, unknown> }[] }, kind: string) =>
  out.emails.filter((e) => e.kind === kind).map((e) => e.args)
const names = (list: unknown) => (list as { name: string }[]).map((s) => s.name)
const MUSIC_FILE = { id: 'file-1', file_name: 'Canon in D.pdf', file_size: 1000, scope: 'all', project_file_instruments: [] }
const musicRequest = (route: string, body: unknown) =>
  new NextRequest(`http://localhost:3000/api/projects/${QUARTET_PROJECT.id}/${route}`, { method: 'POST', body: JSON.stringify(body) })
const COCKTAIL_AT = '2026-11-07T22:30:00Z' // the fixture's Cocktail Hour
const subjectDate = (iso: string) => (email.formatPerformanceDateForSubject as (iso: string, tz?: string) => string)(iso, QUARTET_ORG.timezone)

// ---------------------------------------------------------------------------
// The scenarios
// ---------------------------------------------------------------------------

type Scenario = (variant: Variant) => { tables: Tables; run: () => Promise<unknown> }

const scenarios: Record<string, Scenario> = {
  'send gig details': (v) => ({
    tables: { projects: [project(v)] },
    run: () =>
      sendGigDetailsToMusicians({ projectId: QUARTET_PROJECT.id, organizationId: QUARTET_ORG.id, sentBy: 'user-admin', serviceClient: looseDb() as never }),
  }),
  'gig details reminder': (v) => ({
    tables: {
      organization_members: [{ organization_id: QUARTET_ORG.id }],
      gig_detail_sends: [{ id: 'send-1', project_id: QUARTET_PROJECT.id, organization_id: QUARTET_ORG.id, sent_at: '2026-11-01T16:00:00Z' }],
      gig_detail_confirmations: (['v1', 'viola', 'cello'] as ChairKey[]).map((k, i) => ({
        id: `conf-${i}`,
        token: `tok-conf-${i}`,
        musician_id: musician(k).id,
        musician: musician(k),
      })),
      projects: [project(v)],
    },
    run: async () =>
      seen(
        await gigDetailsReminderPOST(
          new NextRequest(`http://localhost:3000/api/projects/${QUARTET_PROJECT.id}/send-gig-details-reminder`, {
            method: 'POST',
            body: JSON.stringify({ sendId: 'send-1' }),
          }),
          { params: Promise.resolve({ projectId: QUARTET_PROJECT.id }) }
        )
      ),
  }),
  'confirm-details page': (v) => ({
    tables: {
      gig_detail_confirmations: [
        {
          id: 'conf-0',
          token: 'tok-conf-0',
          confirmed_at: null,
          musician: musician('v1'),
          send: { id: 'send-1', sent_at: '2026-11-01T16:00:00Z', project: project(v) },
        },
      ],
      services: services(v),
    },
    run: async () => {
      const el = (await ConfirmDetailsPage({ params: Promise.resolve({ token: 'tok-conf-0' }), searchParams: Promise.resolve({}) })) as ReactElement<Record<string, unknown>>
      return el.props
    },
  }),
  'staffing alert (cron)': (v) => ({
    tables: { projects: [project(v)], email_logs: [] },
    run: async () => seen(await staffingAlertsGET(cron('/api/cron/staffing-alerts'))),
  }),
  'pre-gig reminder (cron)': (v) => ({
    tables: { projects: [project(v)], pre_gig_reminders: [] },
    run: async () => seen(await preGigGET(cron('/api/cron/pre-gig-reminders'))),
  }),
  'after-gig pay summary': (v) => ({
    tables: {},
    run: () => sendPaySummaryOnce(looseDb(), project(v)),
  }),
  'send music': (v) => ({
    tables: {
      organization_members: [{ organization_id: QUARTET_ORG.id }],
      projects: [project(v)],
      project_files: [MUSIC_FILE],
    },
    run: async () => seen(await sendMusicPOST(musicRequest('send-music', {}), { params: Promise.resolve({ projectId: QUARTET_PROJECT.id }) })),
  }),
  'send music reminder': (v) => ({
    tables: {
      organization_members: [{ organization_id: QUARTET_ORG.id }],
      music_sends: [{ id: 'msend-1', project_id: QUARTET_PROJECT.id, organization_id: QUARTET_ORG.id, sent_at: '2026-11-01T16:00:00Z' }],
      music_confirmations: (['v1', 'viola', 'cello'] as ChairKey[]).map((k, i) => ({
        id: `mconf-${i}`,
        token: `tok-mconf-${i}`,
        musician_id: musician(k).id,
        musician: musician(k),
      })),
      projects: [project(v)],
      project_files: [MUSIC_FILE],
      project_positions: chairs(v).filter((c) => c.status === 'confirmed'),
    },
    run: async () =>
      seen(await sendMusicReminderPOST(musicRequest('send-music-reminder', { sendId: 'msend-1' }), { params: Promise.resolve({ projectId: QUARTET_PROJECT.id }) })),
  }),
}

async function outcome(name: string, variant: Variant, scopeOf?: (key: ChairKey) => string[]) {
  const s = scenarios[name](variant)
  if (scopeOf) {
    // A variant of the gig with chosen scopes, in every table that carries it.
    const p = project(variant, scopeOf)
    for (const rows of Object.values(s.tables)) {
      rows.forEach((row, i) => {
        const r = row as Record<string, unknown>
        if (r.project_positions) rows[i] = p
        if ((r.send as { project?: unknown } | undefined)?.project) (r.send as { project: unknown }).project = p
      })
    }
    if (name === 'after-gig pay summary') return observe(s.tables, () => sendPaySummaryOnce(looseDb(), p))
  }
  return observe(s.tables, s.run)
}

describe("a chair on the whole gig ('all') is exactly today, sender by sender", () => {
  for (const name of Object.keys(scenarios)) {
    it(name, async () => {
      const today = await outcome(name, 'today')
      const all = await outcome(name, 'all')
      expect(all).toEqual(today)
      expect(today.emails.length).toBeGreaterThan(name === 'confirm-details page' ? -1 : 0)
    })
  }
})

describe("a chair limited to Cocktail Hour ('selected') hears about Cocktail Hour only", () => {
  it('gig details: each person is sent only the services their chair works', async () => {
    const out = await outcome('send gig details', 'selected')
    const sent = argsOf(out, 'sendGigDetailsEmail')
    expect(sent).toHaveLength(3)
    for (const args of sent) expect(names(args.services)).toEqual(['Cocktail Hour'])
    const today = argsOf(await outcome('send gig details', 'today'), 'sendGigDetailsEmail')
    for (const args of today) expect(names(args.services)).toEqual(['Ceremony', 'Cocktail Hour'])
  })

  it('gig details: two people on different calls each get their own', async () => {
    const out = await outcome('send gig details', 'selected', (k) => (k === 'v1' ? ['svc-rehearsal', 'svc-ceremony'] : ['svc-cocktail']))
    const byPerson = Object.fromEntries(argsOf(out, 'sendGigDetailsEmail').map((a) => [a.to, names(a.services)]))
    expect(byPerson).toEqual({
      'mus-v1-a@example.com': ['Rehearsal', 'Ceremony'],
      'mus-viola-a@example.com': ['Cocktail Hour'],
      'mus-cello-a@example.com': ['Cocktail Hour'],
    })
  })

  it('gig details reminder: only their services', async () => {
    const out = await outcome('gig details reminder', 'selected')
    const sent = argsOf(out, 'sendGigDetailsReminderEmail')
    expect(sent).toHaveLength(3)
    for (const args of sent) expect(names(args.services)).toEqual(['Cocktail Hour'])
  })

  it("music email: the subject is dated by the first call the person works, not the gig's rehearsal", async () => {
    const cocktail = subjectDate(COCKTAIL_AT)
    const rehearsal = subjectDate(REHEARSAL.start_time)
    expect(cocktail).not.toEqual(rehearsal)
    const sent = argsOf(await outcome('send music', 'selected'), 'sendMusicUploadedEmail')
    expect(sent.map((a) => a.performanceDate)).toEqual([cocktail, cocktail, cocktail])
    const mixed = argsOf(await outcome('send music', 'selected', (k) => (k === 'v1' ? ['svc-rehearsal'] : ['svc-cocktail'])), 'sendMusicUploadedEmail')
    expect(Object.fromEntries(mixed.map((a) => [a.to, a.performanceDate]))).toEqual({
      'mus-v1-a@example.com': rehearsal,
      'mus-viola-a@example.com': cocktail,
      'mus-cello-a@example.com': cocktail,
    })
  })

  it('music reminder: the same', async () => {
    const cocktail = subjectDate(COCKTAIL_AT)
    const sent = argsOf(await outcome('send music reminder', 'selected'), 'sendMusicReminderEmail')
    expect(sent.map((a) => a.performanceDate)).toEqual([cocktail, cocktail, cocktail])
  })

  it('confirm-details page: only their services', async () => {
    const out = await outcome('confirm-details page', 'selected')
    expect(names(out.result.services)).toEqual(['Cocktail Hour'])
  })

  it('staffing alert: dated by the first call an open chair still has to work', async () => {
    const out = await outcome('staffing alert (cron)', 'selected')
    const [alert] = argsOf(out, 'sendStaffingAlertEmail')
    expect(alert.gigDate).toBe('Saturday, November 7, 2026') // Cocktail Hour, not Friday's rehearsal
    expect(alert).toMatchObject({ totalPositions: 4, confirmedCount: 3 })
  })

  it('staffing alert: an open chair whose only call is over needs nobody, so no alert', async () => {
    const planned = REHEARSAL.start_time
    REHEARSAL.start_time = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString()
    try {
      const out = await outcome('staffing alert (cron)', 'selected', (k) => (k === 'v2' ? ['svc-rehearsal'] : ['svc-cocktail']))
      expect(argsOf(out, 'sendStaffingAlertEmail')).toHaveLength(0)
    } finally {
      REHEARSAL.start_time = planned
    }
  })

  it('pre-gig reminder: counts the confirmed people who work a call', async () => {
    const out = await outcome('pre-gig reminder (cron)', 'selected', (k) => (k === 'cello' ? [] : ['svc-cocktail']))
    expect(argsOf(out, 'sendPreGigNotificationEmail')[0].musicianCount).toBe(2)
    const today = await outcome('pre-gig reminder (cron)', 'today')
    expect(argsOf(today, 'sendPreGigNotificationEmail')[0].musicianCount).toBe(3)
  })

  it('after-gig pay summary: each person is owed for the services their chair works', async () => {
    const lines = async (v: Variant) =>
      Object.fromEntries((argsOf(await outcome('after-gig pay summary', v), 'sendPaySummaryEmail')[0].lines as { name: string; total: number }[]).map((l) => [l.name, l.total]))
    // Today, Violin 1 has the Ceremony's leader fee on top of both services.
    expect(await lines('today')).toEqual({ 'V1A Player': 300, 'VIOLAA Player': 250, 'CELLOA Player': 250 })
    expect(await lines('selected')).toEqual({ 'V1A Player': 100, 'VIOLAA Player': 100, 'CELLOA Player': 100 })
  })
})
