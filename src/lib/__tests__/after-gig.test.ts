import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { MockSupabaseDb } from './helpers/supabase-mock'

/**
 * After the gig (089): 30 minutes after the last service ends, the owners and
 * admins get "what to pay each person" (NEVER the musicians), and the gig's
 * ONE lead is asked for a gig report: the admin's pick, else Violin 1. "Leader"
 * on the roster only means someone CAN lead and is never used (David, 2026-09-27).
 */

const state = vi.hoisted(() => ({ db: undefined as unknown as MockSupabaseDb, adminEmails: ['owner@org.test', 'admin@org.test'] }))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => state.db,
  getOrgAdminEmails: vi.fn(async () => state.adminEmails),
}))

vi.mock('@/lib/email/send', () => ({
  sendPaySummaryEmail: vi.fn(async (p: { adminEmails: string[] }) => ({ id: 'em-pay', subject: 'Pay', emailHtml: '<p/>', suppressed: false, to: p.adminEmails })),
  sendGigReportRequestEmail: vi.fn(async () => ({ id: 'em-req', subject: 'How did it go?', emailHtml: '<p/>', suppressed: false })),
}))

vi.mock('@/lib/email/log', () => ({ hasRecentFailure: async () => false, logEmail: vi.fn(async () => {}) }))

import { buildPaySummary, gigEndedAt, gigLead, isAfterGigDue, isViolinOne, type PositionForAfterGig, type ServiceForAfterGig } from '@/lib/after-gig/rules'
import { requestGigReports, sendPaySummaryOnce } from '@/lib/after-gig/run'
import { acceptedOfferPay, computeGigPay } from '@/lib/payments/compute'
import { sendGigReportRequestEmail, sendPaySummaryEmail } from '@/lib/email/send'

// --- fixtures -----------------------------------------------------------------

const SERVICES: ServiceForAfterGig[] = [
  { id: 's1', name: 'Ceremony', start_time: '2026-09-26T21:00:00Z', end_time: '2026-09-26T22:00:00Z', base_pay: 200, leader_fee: 50 },
  { id: 's2', name: 'Cocktails', start_time: '2026-09-26T22:15:00Z', end_time: '2026-09-26T23:15:00Z', base_pay: 150, leader_fee: null },
]

function position(id: string, over: Partial<PositionForAfterGig> & { musician?: PositionForAfterGig['musician'] }): PositionForAfterGig {
  return { id, status: 'confirmed', musician_id: over.musician?.id ?? null, instrument: { name: 'Violin' }, contract_offers: [], ...over }
}

const LEAD = { id: 'm-lead', first_name: 'Lena', last_name: 'Lead', email: 'lena@musician.test', is_leader: true }
const PLAYER = { id: 'm-play', first_name: 'Pat', last_name: 'Player', email: 'pat@musician.test', is_leader: false }
const CUSTOM = { id: 'm-custom', first_name: 'Cam', last_name: 'Custom', email: 'cam@musician.test', is_leader: true }

const POSITIONS: PositionForAfterGig[] = [
  position('p1', { musician: LEAD, instrument: { name: 'Violin 1' }, chair_number: 1 }),
  position('p2', { musician: PLAYER, instrument: { name: 'Cello' }, chair_number: 1 }),
  position('p3', { musician: CUSTOM, instrument: { name: 'Violin 2' }, chair_number: 1, contract_offers: [{ custom_pay: 500, status: 'accepted' }, { custom_pay: 999, status: 'declined' }] }),
  position('p4', { status: 'offered', musician: { ...PLAYER, id: 'm-offered', email: 'offered@musician.test' } }),
]

function project(over: Record<string, unknown> = {}) {
  return {
    id: 'proj-1',
    name: 'Smith Wedding',
    status: 'active',
    organization_id: 'org-1',
    pay_summary_sent_at: null,
    gig_lead_musician_id: null as string | null,
    organization: { id: 'org-1', name: 'Test Strings', timezone: 'America/Chicago' },
    services: SERVICES,
    project_positions: POSITIONS,
    ...over,
  }
}

// --- timing ---------------------------------------------------------------------

describe('when the after-gig sends are due', () => {
  it('uses the LAST service end, so a multi-part gig waits for its final part', () => {
    expect(gigEndedAt(SERVICES)?.toISOString()).toBe('2026-09-26T23:15:00.000Z')
  })

  it('is due from 30 minutes after the end, not before', () => {
    const ended = gigEndedAt(SERVICES)!
    expect(isAfterGigDue(ended, new Date(ended.getTime() + 29 * 60_000))).toBe(false)
    expect(isAfterGigDue(ended, new Date(ended.getTime() + 30 * 60_000))).toBe(true)
  })

  it('stops after 48 hours, so switching it on cannot email old gigs', () => {
    const ended = gigEndedAt(SERVICES)!
    expect(isAfterGigDue(ended, new Date(ended.getTime() + 47 * 3_600_000))).toBe(true)
    expect(isAfterGigDue(ended, new Date(ended.getTime() + 49 * 3_600_000))).toBe(false)
  })

  it('treats a gig with no services as never due', () => {
    expect(isAfterGigDue(gigEndedAt([]), new Date())).toBe(false)
  })
})

// --- who leads ------------------------------------------------------------------

describe('the ONE gig lead', () => {
  it('defaults to whoever is confirmed in Violin 1', () => {
    expect(gigLead(POSITIONS, null)).toMatchObject({ source: 'violin-1', lead: { musicianId: 'm-lead', firstName: 'Lena' } })
  })

  it('never uses the roster "Leader" flag: someone who CAN lead is not the leader', () => {
    // Cam is marked Leader but plays Violin 2; Pat is not marked Leader but sits in Violin 1.
    const seats = [
      position('a', { musician: CUSTOM, instrument: { name: 'Violin 2' }, chair_number: 1 }),
      position('b', { musician: { ...PLAYER, is_leader: false }, instrument: { name: 'Violin 1' }, chair_number: 1 }),
    ]
    expect(gigLead(seats, null).lead?.musicianId).toBe('m-play')
    // Two musicians marked Leader and no Violin 1: nobody, NOT one of them.
    const noViolinOne = [
      position('c', { musician: LEAD, instrument: { name: 'Viola' } }),
      position('d', { musician: CUSTOM, instrument: { name: 'Cello' } }),
    ]
    expect(gigLead(noViolinOne, null)).toEqual({ lead: null, source: 'needs-pick' })
    expect(gigLead([position('e', { musician: LEAD, instrument: { name: 'Cello' } })], null).source).toBe('needs-pick')
  })

  it("the admin's pick overrides Violin 1", () => {
    expect(gigLead(POSITIONS, 'm-custom')).toMatchObject({ source: 'chosen', lead: { musicianId: 'm-custom' } })
    expect(gigLead(POSITIONS, 'm-play').lead?.musicianId).toBe('m-play')
  })

  it('a pick who is no longer confirmed falls back to Violin 1', () => {
    expect(gigLead(POSITIONS, 'm-gone').source).toBe('violin-1')
    expect(gigLead(POSITIONS, 'm-offered').lead?.musicianId).toBe('m-lead')
  })

  it('with two Violin 1 chairs, chair 1 leads; an unconfirmed Violin 1 does not count', () => {
    const two = [
      position('v2', { musician: CUSTOM, instrument: { name: 'Violin 1' }, chair_number: 2 }),
      position('v1', { musician: LEAD, instrument: { name: 'Violin 1' }, chair_number: 1 }),
    ]
    expect(gigLead(two, null).lead?.musicianId).toBe('m-lead')
    const offered = [position('v1', { status: 'offered', musician: LEAD, instrument: { name: 'Violin 1' }, chair_number: 1 })]
    expect(gigLead(offered, null).source).toBe('needs-pick')
  })

  it('recognises how Violin 1 is written', () => {
    for (const n of ['Violin 1', 'violin 1', ' Violin 1 ', 'Violin I']) expect(isViolinOne(n), n).toBe(true)
    for (const n of ['Violin 2', 'Viola', 'Violin', 'Violin 10', null]) expect(isViolinOne(n), String(n)).toBe(false)
  })
})

// --- pay ------------------------------------------------------------------------

describe('pay summary amounts', () => {
  it('match the Generate Payments rule', () => {
    const { lines, grandTotal } = buildPaySummary(SERVICES, POSITIONS)
    const byId = Object.fromEntries(lines.map((l) => [l.musicianId, l]))

    // Leader on the service default: 200 + 50 leader fee, then 150 (no fee on s2).
    expect(byId['m-lead']).toMatchObject({ basePay: 350, leaderFee: 50, total: 400 })
    // Plain player: base pay on both services.
    expect(byId['m-play']).toMatchObject({ basePay: 350, leaderFee: 0, total: 350, instrument: 'Cello' })
    // An accepted offer amount is the whole-gig fee: owed once, leader part included.
    expect(byId['m-custom']).toMatchObject({ basePay: 500, leaderFee: 0, total: 500 })
    // An offered (unconfirmed) chair is not paid.
    expect(byId['m-offered']).toBeUndefined()
    expect(grandTotal).toBe(1250)

    // Same numbers as the shared rule Generate Payments now calls.
    for (const p of POSITIONS.filter((x) => x.status === 'confirmed')) {
      const expected = computeGigPay(SERVICES, !!p.musician!.is_leader, acceptedOfferPay(p.contract_offers))
        .reduce((sum, line) => sum + line.total, 0)
      expect(byId[p.musician!.id].total).toBe(expected)
    }
  })

  it('Generate Payments uses the shared rule, not its own copy', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/payments/generate/route.ts'), 'utf8')
    expect(src).toContain('computeGigPay(')
    expect(src).not.toContain('offerPay ?? service.base_pay')
  })
})

// --- sending --------------------------------------------------------------------

describe('sending the pay summary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.adminEmails = ['owner@org.test', 'admin@org.test']
    state.db = new MockSupabaseDb({ projects: [{ id: 'proj-1', pay_summary_sent_at: null }], gig_reports: [] })
  })

  it('goes to owners and admins ONLY, never to a musician on the gig', async () => {
    expect(await sendPaySummaryOnce(state.db, project())).toBe('sent')
    const call = vi.mocked(sendPaySummaryEmail).mock.calls[0][0]
    expect(call.adminEmails).toEqual(['owner@org.test', 'admin@org.test'])
    const musicianEmails = POSITIONS.map((p) => p.musician?.email)
    for (const email of call.adminEmails) expect(musicianEmails).not.toContain(email)
  })

  it('is sent once: a second run finds the claim and does nothing', async () => {
    await sendPaySummaryOnce(state.db, project())
    expect(await sendPaySummaryOnce(state.db, project())).toBe('skipped')
    expect(sendPaySummaryEmail).toHaveBeenCalledTimes(1)
  })

  it('releases the claim when the send fails, so the next run retries', async () => {
    vi.mocked(sendPaySummaryEmail).mockRejectedValueOnce(new Error('resend down'))
    expect(await sendPaySummaryOnce(state.db, project())).toBe('failed')
    expect(state.db.row('projects', 'proj-1')?.pay_summary_sent_at).toBeNull()
    expect(await sendPaySummaryOnce(state.db, project())).toBe('sent')
  })

  it('skips a gig nobody is confirmed on', async () => {
    expect(await sendPaySummaryOnce(state.db, project({ project_positions: [] }))).toBe('skipped')
    expect(sendPaySummaryEmail).not.toHaveBeenCalled()
  })

  it('the pay summary sender takes admin recipients by name, and the only caller uses getOrgAdminEmails', () => {
    const run = readFileSync(join(process.cwd(), 'src/lib/after-gig/run.ts'), 'utf8')
    const payFn = run.slice(run.indexOf('export async function sendPaySummaryOnce'), run.indexOf('export interface ReportRequestOutcome'))
    expect(payFn).toContain('getOrgAdminEmails(project.organization_id)')
    expect(payFn).not.toMatch(/musician\??\.email|lead\.email/)
  })
})

describe('asking the lead for a gig report', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.db = new MockSupabaseDb({ projects: [{ id: 'proj-1' }], gig_reports: [] })
  })

  const withLead = (id: string | null) => project({ gig_lead_musician_id: id })

  it('asks ONLY the one gig lead, with a 64-hex token link and no pay information', async () => {
    const outcomes = await requestGigReports(state.db, withLead('m-lead'))
    expect(outcomes.map((o) => [o.musicianId, o.outcome])).toEqual([['m-lead', 'sent']])
    const calls = vi.mocked(sendGigReportRequestEmail).mock.calls.map((c) => c[0])
    expect(calls.map((c) => c.to)).toEqual(['lena@musician.test'])
    expect(calls[0].reportUrl).toMatch(/\/report\/[a-f0-9]{64}$/)
    expect(JSON.stringify(calls[0])).not.toMatch(/pay|\$\d/i)
    expect(state.db.tables.gig_reports).toHaveLength(1)
  })

  it('with nobody picked, asks the Violin 1 (and only them)', async () => {
    const outcomes = await requestGigReports(state.db, withLead(null))
    expect(outcomes.map((o) => [o.musicianId, o.outcome])).toEqual([['m-lead', 'sent']])
  })

  it('asks NOBODY when there is no Violin 1 and none was picked, even if people are marked Leader', async () => {
    const noViolinOne = project({ project_positions: [
      position('c', { musician: LEAD, instrument: { name: 'Viola' } }),
      position('d', { musician: CUSTOM, instrument: { name: 'Cello' } }),
    ] })
    expect(await requestGigReports(state.db, noViolinOne)).toEqual([])
    expect(sendGigReportRequestEmail).not.toHaveBeenCalled()
    expect(state.db.tables.gig_reports).toHaveLength(0)
  })

  it('does not ask again on the next run', async () => {
    await requestGigReports(state.db, withLead('m-lead'))
    const again = await requestGigReports(state.db, withLead('m-lead'))
    expect(again.every((o) => o.outcome === 'already-asked')).toBe(true)
    expect(sendGigReportRequestEmail).toHaveBeenCalledTimes(1)
  })

  it('"Send again" re-sends the same link, but never after the lead has reported', async () => {
    await requestGigReports(state.db, withLead('m-lead'))
    const token = state.db.tables.gig_reports[0].token
    vi.clearAllMocks()
    expect((await requestGigReports(state.db, withLead('m-lead'), { force: true }))[0].outcome).toBe('sent')
    expect(vi.mocked(sendGigReportRequestEmail).mock.calls[0][0].reportUrl).toContain(token)
    state.db.tables.gig_reports[0].submitted_at = '2026-09-27T01:00:00Z'
    expect((await requestGigReports(state.db, withLead('m-lead'), { force: true }))[0].outcome).toBe('already-asked')
    expect(state.db.tables.gig_reports).toHaveLength(1)
  })

  it('removes a new row whose email never left, so the next run asks again', async () => {
    vi.mocked(sendGigReportRequestEmail).mockRejectedValueOnce(new Error('resend down'))
    expect((await requestGigReports(state.db, withLead('m-lead')))[0].outcome).toBe('failed')
    expect(state.db.tables.gig_reports).toHaveLength(0)
  })

  it('reports a lead with no email instead of silently skipping them', async () => {
    const noEmail = project({ project_positions: [position('p1', { musician: { ...LEAD, email: null }, instrument: { name: 'Violin 1' }, chair_number: 1 })] })
    const outcomes = await requestGigReports(state.db, noEmail)
    expect(outcomes).toEqual([{ musicianId: 'm-lead', name: 'Lena Lead', outcome: 'no-email' }])
  })

  it('the pay summary says when no report was requested because no lead is set', async () => {
    state.db = new MockSupabaseDb({ projects: [{ id: 'proj-1', pay_summary_sent_at: null }] })
    await sendPaySummaryOnce(state.db, project({ project_positions: [position('c', { musician: LEAD, instrument: { name: 'Viola' } })] }))
    expect(vi.mocked(sendPaySummaryEmail).mock.calls[0][0]).toMatchObject({ needsGigLead: true })
    state.db = new MockSupabaseDb({ projects: [{ id: 'proj-1', pay_summary_sent_at: null }] })
    vi.clearAllMocks()
    await sendPaySummaryOnce(state.db, withLead('m-lead'))
    expect(vi.mocked(sendPaySummaryEmail).mock.calls[0][0]).toMatchObject({ needsGigLead: false })
  })
})

describe('the public report link', () => {
  it('the resolver rejects anything that is not one of our tokens before touching the database', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/after-gig/report-token.ts'), 'utf8')
    expect(src).toContain('/^[a-f0-9]{64}$/')
    expect(src).toContain("project.status === 'cancelled'")
  })

  it('the submit route locks after the first submission and is rate limited', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/report/[token]/route.ts'), 'utf8')
    expect(src).toContain(".is('submitted_at', null)")
    expect(src).toContain('rateLimit(`gig-report:${token}`')
    expect(src).toContain('getOrgAdminEmails(report.organizationId)')
  })

  it('setting the gig lead is admin-only and only accepts someone confirmed on the gig', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/projects/[projectId]/gig-lead/route.ts'), 'utf8')
    expect(src).toContain('requireOrgAdmin()')
    expect(src).toContain("p.status === 'confirmed' && p.musician_id === musicianId")
    expect(src).toContain('project.organization_id !== membership!.organization_id')
  })

  it('gig reports are readable by admins only (089 RLS)', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/089_after_gig.sql'), 'utf8')
    expect(sql).toContain('USING (is_org_admin(organization_id))')
    expect(sql).not.toMatch(/TO\s+anon/i)
  })
})
