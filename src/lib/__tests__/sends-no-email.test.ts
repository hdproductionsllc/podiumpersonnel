import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * Gig details and music sends reach a gig's whole confirmed roster, including
 * the people without an email on file (Lori Stone Wedding, 2026-10-06): the
 * viola had no email when the details went out, was silently dropped, and the
 * third of three confirmations announced "All 3 musicians have now confirmed!"
 * on a four-person gig.
 *
 * - The send counts everyone on the gig, so "all confirmed" cannot fire early.
 * - Whoever cannot be emailed is named back (skippedNames), never dropped quietly.
 * - A follow-up reaches only the people not on the send yet, with its notes;
 *   nobody already on it is emailed again.
 */

type Tables = Record<string, unknown[]>
const state = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]>, log: [] as { table: string; op: string; payload: unknown }[] }))

/** Every read answers with the table's rows; .single() the first. Writes are recorded and echoed back. */
function looseDb() {
  return {
    from(table: string) {
      let op = 'select'
      let payload: unknown
      let single = false
      const result = () => {
        state.log.push({ table, op, payload })
        if (op === 'insert') {
          const rows = (Array.isArray(payload) ? payload : [payload]).map((r, i) => ({ id: `${table}-new-${i + 1}`, token: `tok-${(r as { musician_id?: string }).musician_id ?? i}`, ...(r as object) }))
          return { data: single ? rows[0] : rows, error: null }
        }
        if (op === 'update') return { data: [{ id: `${table}-written` }], error: null }
        const rows = state.tables[table] ?? []
        return { data: single ? (rows[0] ?? null) : rows, error: null }
      }
      const c: Record<string, unknown> = {}
      for (const m of ['eq', 'neq', 'in', 'is', 'not', 'order', 'limit']) c[m] = () => c
      c.select = () => c
      c.insert = (rows: unknown) => ((op = 'insert'), (payload = rows), c)
      c.update = (patch: unknown) => ((op = 'update'), (payload = patch), c)
      c.single = () => ((single = true), c)
      c.maybeSingle = () => ((single = true), c)
      c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej)
      return c
    },
    auth: { getUser: async () => ({ data: { user: { id: 'user-admin' } } }) },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => looseDb(),
  createClient: async () => looseDb(),
  getOrgAdminEmails: vi.fn(async () => ['admin@example.com']),
}))
vi.mock('@/lib/api-helpers', () => ({ getOrgPlan: vi.fn(async () => null) }))
vi.mock('@/lib/email/send', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>()
  return {
    ...real,
    sendGigDetailsEmail: vi.fn(async () => ({ id: 'gd', subject: 'Gig details', emailHtml: '<p/>' })),
    sendMusicUploadedEmail: vi.fn(async () => ({ id: 'mu', subject: 'Music', emailHtml: '<p/>' })),
  }
})
vi.mock('@/lib/email/log', () => ({ hasRecentFailure: async () => false, logEmail: vi.fn(async () => {}) }))
vi.mock('@/lib/email/client', () => ({ logEmailConfig: vi.fn() }))

import { sendGigDetailsEmail, sendMusicUploadedEmail } from '@/lib/email/send'
import { sendGigDetailsToMusicians } from '@/lib/send-gig-details'
import { confirmedMembers } from '@/lib/projects/send-roster'
import { POST as sendMusicPOST } from '@/app/api/projects/[projectId]/send-music/route'

const ORG = { id: 'org-1', name: 'Project String Quartet', timezone: 'America/Chicago' }
const person = (id: string, first: string, last: string, email: string | null) => ({ id, first_name: first, last_name: last, email, phone: null })
const chair = (id: string, instrument: string, m: ReturnType<typeof person>) => ({
  id: `pos-${id}`, chair_number: 1, status: 'confirmed', musician_id: m.id, instrument_id: `inst-${instrument}`,
  instrument: { id: `inst-${instrument}`, name: instrument }, musician: m,
})

const TARA = person('m-tara', 'Tara', 'Santiago', 'tara@example.com')
const SOOAH = person('m-sooah', 'Sooah', 'Jung', 'sooah@example.com')
const REBECCA = person('m-rebecca', 'Rebecca', 'Chung', 'rebecca@example.com')
const LAURA_NO_EMAIL = person('m-laura', 'Laura', 'Reycraft', null)
const LAURA = { ...LAURA_NO_EMAIL, email: 'laura@example.com' }

function project(laura: ReturnType<typeof person>) {
  return {
    id: 'proj-1', name: 'Lori Stone Wedding', ensemble_type: 'String Quartet', organization_id: ORG.id, organization: ORG,
    services: [{ id: 'svc-1', name: 'Performance', start_time: '2026-10-11T22:00:00Z', call_time: null, end_time: null, venue: 'Whittemore House' }],
    project_positions: [
      chair('v1', 'Violin 1', REBECCA), chair('v2', 'Violin 2', SOOAH), chair('va', 'Viola', laura), chair('vc', 'Cello', TARA),
      { id: 'pos-open', chair_number: 2, status: 'open', musician_id: null, instrument: { id: 'inst-x', name: 'Bass' }, musician: null },
    ],
  }
}

const writes = (table: string, op: string) => state.log.filter((w) => w.table === table && w.op === op).map((w) => w.payload)
const recipientsOf = (fn: unknown) => vi.mocked(fn as (p: { to: string }) => unknown).mock.calls.map(([p]) => (p as { to: string }).to)

beforeEach(() => {
  state.tables = {} as Tables
  state.log = []
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('confirmedMembers', () => {
  it('is one entry per confirmed musician, with whether they can be emailed', () => {
    const p = project(LAURA_NO_EMAIL).project_positions
    const twoChairs = { ...chair('v1b', 'Violin 1', REBECCA), id: 'pos-v1b' }
    expect(confirmedMembers([...p, twoChairs, { ...chair('x', 'Viola', TARA), status: 'offered' }])).toEqual([
      { musicianId: 'm-rebecca', name: 'Rebecca Chung', hasEmail: true },
      { musicianId: 'm-sooah', name: 'Sooah Jung', hasEmail: true },
      { musicianId: 'm-laura', name: 'Laura Reycraft', hasEmail: false },
      { musicianId: 'm-tara', name: 'Tara Santiago', hasEmail: true },
    ])
  })
})

describe('gig details', () => {
  it('counts the musician without an email, names them, and keeps them on the roster', async () => {
    state.tables = { projects: [project(LAURA_NO_EMAIL)] }
    const result = await sendGigDetailsToMusicians({ projectId: 'proj-1', organizationId: ORG.id, sentBy: 'user-admin', additionalNotes: 'Dressy black' })

    expect(writes('gig_detail_sends', 'insert')).toEqual([expect.objectContaining({ musician_count: 4, notes: 'Dressy black' })])
    expect((writes('gig_detail_confirmations', 'insert')[0] as { musician_id: string }[]).map((c) => c.musician_id).sort())
      .toEqual(['m-rebecca', 'm-sooah', 'm-tara'])
    expect(recipientsOf(sendGigDetailsEmail).sort()).toEqual(['rebecca@example.com', 'sooah@example.com', 'tara@example.com'])
    expect(result.skippedNames).toEqual(['Laura Reycraft'])
    // The others still see the whole ensemble, Laura included.
    const roster = vi.mocked(sendGigDetailsEmail).mock.calls[0][0].roster
    expect(roster.map((r) => r.name)).toContain('Laura Reycraft')
  })

  it('follow-up emails only the person not on the send, with its notes, and nobody else again', async () => {
    state.tables = {
      projects: [project(LAURA)],
      gig_detail_sends: [{ id: 'send-1', notes: 'Dressy black', gig_detail_confirmations: [{ musician_id: 'm-tara' }, { musician_id: 'm-sooah' }, { musician_id: 'm-rebecca' }] }],
    }
    const result = await sendGigDetailsToMusicians({ projectId: 'proj-1', organizationId: ORG.id, sentBy: 'user-admin', followUpSendId: 'send-1' })

    expect(writes('gig_detail_sends', 'insert')).toEqual([])
    expect(writes('gig_detail_sends', 'update')).toEqual([{ musician_count: 4 }])
    expect(writes('gig_detail_confirmations', 'insert')).toEqual([[{ send_id: 'send-1', musician_id: 'm-laura' }]])
    expect(recipientsOf(sendGigDetailsEmail)).toEqual(['laura@example.com'])
    expect(vi.mocked(sendGigDetailsEmail).mock.calls[0][0].notes).toBe('Dressy black')
    expect(result).toMatchObject({ sent: 1, sendId: 'send-1', skippedNames: [] })
  })

  it('follow-up with nobody new sends nothing', async () => {
    state.tables = {
      projects: [project(LAURA)],
      gig_detail_sends: [{ id: 'send-1', notes: null, gig_detail_confirmations: ['m-tara', 'm-sooah', 'm-rebecca', 'm-laura'].map((musician_id) => ({ musician_id })) }],
    }
    await expect(sendGigDetailsToMusicians({ projectId: 'proj-1', organizationId: ORG.id, sentBy: 'user-admin', followUpSendId: 'send-1' }))
      .rejects.toThrow('Everyone on this gig already has these gig details')
    expect(sendGigDetailsEmail).not.toHaveBeenCalled()
    expect(writes('gig_detail_sends', 'update')).toEqual([])
  })

  it('a follow-up to someone still without an email says so instead of sending', async () => {
    state.tables = {
      projects: [project(LAURA_NO_EMAIL)],
      gig_detail_sends: [{ id: 'send-1', notes: null, gig_detail_confirmations: [{ musician_id: 'm-tara' }, { musician_id: 'm-sooah' }, { musician_id: 'm-rebecca' }] }],
    }
    await expect(sendGigDetailsToMusicians({ projectId: 'proj-1', organizationId: ORG.id, sentBy: 'user-admin', followUpSendId: 'send-1' }))
      .rejects.toThrow('No email on file for Laura Reycraft')
    expect(sendGigDetailsEmail).not.toHaveBeenCalled()
  })
})

describe('music', () => {
  const FILES = [{ id: 'file-1', file_name: 'Book.pdf', file_size: 100, scope: 'all', project_file_instruments: [] }]
  const post = (body: object) =>
    sendMusicPOST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ projectId: 'proj-1' }) })

  it('counts the musician without an email and names them', async () => {
    state.tables = { organization_members: [{ organization_id: ORG.id }], projects: [project(LAURA_NO_EMAIL)], project_files: FILES }
    const res = await post({ notes: 'Print the book' })
    const data = await res.json()

    expect(writes('music_sends', 'insert')).toEqual([expect.objectContaining({ musician_count: 4, notes: 'Print the book' })])
    expect(recipientsOf(sendMusicUploadedEmail).sort()).toEqual(['rebecca@example.com', 'sooah@example.com', 'tara@example.com'])
    expect(data.skippedNames).toEqual(['Laura Reycraft'])
  })

  it('follow-up emails only the person not on the send, with its notes', async () => {
    state.tables = {
      organization_members: [{ organization_id: ORG.id }],
      projects: [project(LAURA)],
      project_files: FILES,
      music_sends: [{ id: 'msend-1', notes: 'Print the book', music_confirmations: [{ musician_id: 'm-tara' }, { musician_id: 'm-sooah' }, { musician_id: 'm-rebecca' }] }],
    }
    const res = await post({ followUp: true })
    expect(res.status).toBe(200)

    expect(writes('music_sends', 'insert')).toEqual([])
    expect(writes('music_sends', 'update')).toEqual([{ musician_count: 4 }])
    expect(writes('music_confirmations', 'insert')).toEqual([[{ send_id: 'msend-1', musician_id: 'm-laura' }]])
    expect(recipientsOf(sendMusicUploadedEmail)).toEqual(['laura@example.com'])
    expect(vi.mocked(sendMusicUploadedEmail).mock.calls[0][0].notes).toBe('Print the book')
  })
})
