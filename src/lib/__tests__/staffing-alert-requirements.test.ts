import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { render } from '@react-email/render'

/**
 * The staffing alert groups the chairs of one requirement ("Stagehand x 8",
 * migration 099) into one line; every other chair is listed by role exactly as
 * before.
 *
 * __golden__/staffing-alert.quartet.html was rendered from master's template
 * (before 099) with the quartet input below. Do not regenerate it to make this
 * pass: a difference is a change every quartet company's admins would see.
 */

const state = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]> }))

function db() {
  return {
    from(table: string) {
      const rows = () => state.tables[table] ?? []
      const c: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'neq', 'filter', 'limit', 'order', 'in', 'not', 'is']) c[m] = () => c
      c.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null })
      c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(res, rej)
      c.insert = () => c
      return c
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => db(),
  getOrgAdminEmails: vi.fn(async () => ['admin@example.com']),
}))
vi.mock('@/lib/email/send', () => ({
  sendStaffingAlertEmail: vi.fn(async () => ({ id: 'email-1', subject: 'alert', emailHtml: '<p>alert</p>' })),
}))
vi.mock('@/lib/email/log', () => ({ hasRecentFailure: async () => false, logEmail: vi.fn(async () => {}) }))
vi.mock('@/lib/email/client', () => ({ logEmailConfig: vi.fn() }))

import { StaffingAlertEmail } from '@/lib/email/templates/staffing-alert'
import { sendStaffingAlertEmail } from '@/lib/email/send'
import { GET as staffingAlertsGET } from '@/app/api/cron/staffing-alerts/route'

const NOW = new Date('2026-10-05T15:00:00.000Z')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  process.env.CRON_SECRET = 'test-secret'
  delete process.env.CRON_ENABLED
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const base = {
  organizationName: 'Quartet Co',
  projectName: 'Smith Wedding',
  gigDate: 'Saturday, October 10, 2026',
  venueName: 'Chapel',
  daysAway: 5,
  dashboardUrl: 'https://app.example.test/dashboard/projects?expand=proj-1',
}

/** Visible text of the rendered email, one line per paragraph. */
const text = (html: string) =>
  html
    .replace(/<\/p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/<!-- -->/g, '')

describe('the template', () => {
  it('a quartet (no requirements) renders exactly as before', async () => {
    const html = await render(
      StaffingAlertEmail({
        ...base,
        totalPositions: 4,
        confirmedCount: 2,
        unfilledPositions: [
          { instrument: 'Violin 2', chairNumber: 1, status: 'vacant' },
          { instrument: 'Viola', chairNumber: 1, status: 'offered' },
        ],
      })
    )
    await expect(html).toMatchFileSnapshot('./__golden__/staffing-alert.quartet.html')
  })

  it("a requirement's chairs are one line; two requirements for one role stay two", async () => {
    const loadIn = { key: 'requirement:in', label: 'Stagehand (Load-in)', quantity: 8 }
    const strike = { key: 'requirement:out', label: 'Stagehand (Strike)', quantity: 4 }
    const html = await render(
      StaffingAlertEmail({
        ...base,
        organizationName: 'Crew Co',
        totalPositions: 17,
        confirmedCount: 10,
        unfilledPositions: [
          { instrument: 'A2', chairNumber: 1, status: 'vacant' },
          { instrument: 'Stagehand', chairNumber: 6, status: 'vacant', group: loadIn },
          { instrument: 'Stagehand', chairNumber: 7, status: 'offered', group: loadIn },
          { instrument: 'Stagehand', chairNumber: 8, status: 'vacant', group: loadIn },
          { instrument: 'Stagehand', chairNumber: 9, status: 'vacant', group: strike },
          ...[10, 11, 12].map((n) => ({ instrument: 'Stagehand', chairNumber: n, status: 'vacant' as const, group: strike })),
        ],
      })
    )
    const body = text(html)
    expect(body).toContain('A2: 1 seat (Chair 1 — vacant)')
    expect(body).toContain('Stagehand (Load-in): 3 of 8 still open (Chair 6 — vacant, Chair 7 — pending response, Chair 8 — vacant)')
    expect(body).toContain('Stagehand (Strike): 4 of 4 still open (Chair 9 — vacant, Chair 10 — vacant, Chair 11 — vacant, Chair 12 — vacant)')
  })
})

// ---------------------------------------------------------------------------
// The cron
// ---------------------------------------------------------------------------

const LOAD_IN = { id: 'svc-in', name: 'Load-in', start_time: '2026-10-09T12:00:00Z', venue: 'Hall', venue_id: null, venue_details: null }
const SHOW = { id: 'svc-show', name: 'Show', start_time: '2026-10-09T23:00:00Z', venue: 'Hall', venue_id: null, venue_details: null }

function project(positions: unknown[]) {
  return {
    id: 'proj-1',
    name: 'Acme Leadership Meeting',
    organization_id: 'org-1',
    organization: { id: 'org-1', name: 'Crew Co', timezone: 'America/Chicago', disable_staffing_alerts: false },
    services: [LOAD_IN, SHOW],
    project_positions: positions,
  }
}

const chair = (id: string, n: number, role: string, status: string, scope?: string[]) => ({
  id,
  status,
  chair_number: n,
  instrument: { name: role },
  ...(scope ? { scope_mode: 'selected', position_services: scope.map((service_id) => ({ service_id })) } : { scope_mode: 'all', position_services: [] }),
})

const cron = () =>
  staffingAlertsGET(new NextRequest('http://localhost:3000/api/cron/staffing-alerts', { headers: { authorization: 'Bearer test-secret' } }))

describe('the cron', () => {
  it('a gig with no requirements: every unfilled chair is listed as before, with no group', async () => {
    state.tables = {
      projects: [project([chair('v1', 1, 'Violin 1', 'confirmed'), chair('v2', 1, 'Violin 2', 'vacant')])],
      email_logs: [],
      requirements: [],
    }
    await cron()
    const args = vi.mocked(sendStaffingAlertEmail).mock.calls[0][0]
    expect(args.unfilledPositions).toEqual([{ instrument: 'Violin 2', chairNumber: 1, status: 'vacant' }])
  })

  it("a requirement's chairs carry their line: role, calls, how many it asked for", async () => {
    state.tables = {
      projects: [
        project([
          chair('a1', 1, 'A1', 'vacant'),
          chair('h1', 1, 'Stagehand', 'confirmed', ['svc-in']),
          chair('h2', 2, 'Stagehand', 'vacant', ['svc-in']),
        ]),
      ],
      email_logs: [],
      requirements: [{ id: 'req-in', quantity: 2, project_positions: [{ id: 'h1' }, { id: 'h2' }] }],
    }
    await cron()
    const args = vi.mocked(sendStaffingAlertEmail).mock.calls.at(-1)![0]
    expect(args.unfilledPositions).toEqual([
      { instrument: 'A1', chairNumber: 1, status: 'vacant' },
      { instrument: 'Stagehand', chairNumber: 2, status: 'vacant', group: { key: 'requirement:req-in', label: 'Stagehand (Load-in)', quantity: 2 } },
    ])
  })
})
