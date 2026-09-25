import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// A musician's first download counts as "received": it stamps confirmed_at and
// emails the admins ONCE. Later downloads, the button, and simultaneous file
// clicks must not send a second email; a failed access check must not mark
// anything; and email trouble must never cost the musician their PDF.

const fake = vi.hoisted(() => ({
  confirmedAt: null as string | null,
  // What the conditional claim UPDATE matches ([] = someone else claimed first).
  claimRows: [{ id: 'conf-1' }] as Array<{ id: string }>,
  claimError: null as null | { message: string },
  claims: 0,
  fileProjectId: 'proj-1',
  afterCallbacks: [] as Array<() => Promise<void>>,
  emails: [] as Array<{ to: string[]; subject: string; html: string }>,
  emailThrows: false,
  reset() {
    this.confirmedAt = null
    this.claimRows = [{ id: 'conf-1' }]
    this.claimError = null
    this.claims = 0
    this.fileProjectId = 'proj-1'
    this.afterCallbacks = []
    this.emails = []
    this.emailThrows = false
  },
}))

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (fn: () => Promise<void>) => fake.afterCallbacks.push(fn) }
})

function row(table: string, op: string, filters: Record<string, unknown>) {
  if (table === 'music_confirmations' && op === 'select' && 'token' in filters)
    return { id: 'conf-1', musician_id: 'mus-1', send_id: 'send-1', confirmed_at: fake.confirmedAt }
  if (table === 'music_confirmations' && op === 'select')
    return {
      musician: { id: 'mus-1', first_name: 'Sam', last_name: '<b>Lee</b>' },
      send: { id: 'send-1', organization_id: 'org-1', musician_count: 4, project: { id: 'proj-1', name: 'Smith Wedding' } },
    }
  if (table === 'music_sends') return { project_id: 'proj-1' }
  if (table === 'project_files')
    return { id: 'file-1', storage_path: 'org-1/proj-1/a.pdf', file_name: 'a.pdf', project_id: fake.fileProjectId, scope: 'all' }
  if (table === 'project_positions') return { instrument_id: 'inst-1' }
  return null
}

vi.mock('@/lib/supabase/server', () => ({
  getOrgAdminEmails: async () => ['admin@example.test'],
  createServiceClient: () => ({
    storage: { from: () => ({}) }, // only handed to the mocked signed-URL helper
    from(table: string) {
      let op = 'select'
      let head = false
      const filters: Record<string, unknown> = {}
      const builder: any = {
        select(_cols?: string, opts?: { head?: boolean }) {
          if (op === 'update') {
            fake.claims++
            return Promise.resolve({ data: fake.claimError ? null : fake.claimRows, error: fake.claimError })
          }
          head = !!opts?.head
          return builder
        },
        insert: () => Promise.resolve({ error: null }),
        update() {
          op = 'update'
          return builder
        },
        eq(col: string, val: unknown) {
          filters[col] = val
          return builder
        },
        is: () => builder,
        not: () => Promise.resolve({ count: head ? 2 : null, error: null }),
        limit: () => builder,
        single: () => Promise.resolve({ data: row(table, op, filters), error: null }),
        maybeSingle: () => Promise.resolve({ data: row(table, op, filters), error: null }),
      }
      return builder
    },
  }),
}))

vi.mock('@/lib/storage/signed-download', () => ({
  createSignedDownloadUrl: async () => ({ url: 'https://storage.example.test/a.pdf', error: null }),
}))

vi.mock('@/lib/email/send', () => ({
  sendEmail: async (p: { to: string[]; subject: string; html: string }) => {
    if (fake.emailThrows) throw new Error('resend down')
    fake.emails.push(p)
    return { id: 're_1', emailHtml: p.html }
  },
}))
vi.mock('@/lib/email/log', () => ({ logEmail: async () => {} }))

async function download() {
  const { GET } = await import('@/app/api/music-download/[fileId]/route')
  const res = await GET(new NextRequest('http://localhost/api/music-download/file-1?token=tok'), {
    params: Promise.resolve({ fileId: 'file-1' }),
  })
  for (const cb of fake.afterCallbacks.splice(0)) await cb()
  return res
}

async function clickButton() {
  const { POST } = await import('@/app/api/confirm-music/[token]/route')
  return POST(new Request('http://localhost/api/confirm-music/tok', { method: 'POST' }), {
    params: Promise.resolve({ token: 'tok' }),
  })
}

describe('music receipt — a download counts as received', () => {
  beforeEach(() => {
    fake.reset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('first download delivers the PDF and emails the admins once', async () => {
    const res = await download()

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://storage.example.test/a.pdf')
    expect(fake.claims).toBe(1)
    expect(fake.emails).toHaveLength(1)
    expect(fake.emails[0].to).toEqual(['admin@example.test'])
    expect(fake.emails[0].subject).toBe('Sam <b>Lee</b> downloaded the music — Smith Wedding')
    // Names are escaped in the body — a typed "<b>" is text, not markup.
    expect(fake.emails[0].html).toContain('Sam &lt;b&gt;Lee&lt;/b&gt;')
    expect(fake.emails[0].html).toContain('2 of 4 musicians')
  })

  it('a musician already marked received downloads with no claim and no email', async () => {
    fake.confirmedAt = '2026-09-25T10:00:00Z'

    const res = await download()

    expect(res.status).toBe(307)
    expect(fake.claims).toBe(0)
    expect(fake.emails).toHaveLength(0)
  })

  it('losing a race (several files at once) sends no second email', async () => {
    fake.claimRows = []

    const res = await download()

    expect(res.status).toBe(307)
    expect(fake.claims).toBe(1)
    expect(fake.emails).toHaveLength(0)
  })

  it('a failed access check never marks the musician received', async () => {
    fake.fileProjectId = 'someone-elses-project'

    const res = await download()

    expect(res.status).toBe(403)
    expect(fake.claims).toBe(0)
    expect(fake.emails).toHaveLength(0)
  })

  it('email or claim trouble never costs the musician the PDF', async () => {
    fake.emailThrows = true
    expect((await download()).status).toBe(307)

    fake.reset()
    fake.claimError = { message: 'connection reset' }
    expect((await download()).status).toBe(307)
  })

  it('the button after a download sends nothing and reports already confirmed', async () => {
    fake.claimRows = []

    const res = await clickButton()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, alreadyConfirmed: true })
    expect(fake.emails).toHaveLength(0)
  })

  it('the button on its own still marks received and emails with its own wording', async () => {
    const res = await clickButton()

    expect(await res.json()).toEqual({ success: true })
    expect(fake.emails).toHaveLength(1)
    expect(fake.emails[0].subject).toBe('Sam <b>Lee</b> confirmed music receipt — Smith Wedding')
  })
})
