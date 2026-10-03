import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// The confirm-details button is a plain HTML form so it works on phones where
// the page's JavaScript never loads (a musician's click once did nothing at
// all). Every outcome is a 303 back to the page. A double submit must email
// the admins once, a failed save must say so, and email trouble must never
// undo the confirmation.

const fake = vi.hoisted(() => ({
  // What the conditional claim UPDATE matches ([] = an earlier click claimed it).
  claimRows: [{ id: 'conf-1' }] as Array<{ id: string }>,
  claimError: null as null | { message: string },
  claims: 0,
  tokenFound: true,
  emails: [] as Array<{ to: string[]; subject: string; html: string }>,
  emailThrows: false,
  reset() {
    this.claimRows = [{ id: 'conf-1' }]
    this.claimError = null
    this.claims = 0
    this.tokenFound = true
    this.emails = []
    this.emailThrows = false
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  getOrgAdminEmails: async () => ['admin@example.test'],
  createServiceClient: () => ({
    from(table: string) {
      let op = 'select'
      let head = false
      const builder: any = {
        select(_cols?: string, opts?: { head?: boolean }) {
          if (op === 'update') {
            fake.claims++
            return Promise.resolve({ data: fake.claimError ? null : fake.claimRows, error: fake.claimError })
          }
          head = !!opts?.head
          return builder
        },
        update() {
          op = 'update'
          return builder
        },
        eq: () => builder,
        is: () => builder,
        not: () => Promise.resolve({ count: head ? 2 : null, error: null }),
        // Token lookup in the route.
        maybeSingle: () =>
          Promise.resolve({ data: table === 'gig_detail_confirmations' && fake.tokenFound ? { id: 'conf-1' } : null, error: null }),
        // Context for the admin email.
        single: () =>
          Promise.resolve({
            data: {
              musician: { id: 'mus-1', first_name: 'Sam', last_name: '<b>Lee</b>' },
              send: { id: 'send-1', organization_id: 'org-1', musician_count: 3, project: { id: 'proj-1', name: 'Smith Wedding' } },
            },
            error: null,
          }),
      }
      return builder
    },
  }),
}))

vi.mock('@/lib/email/send', () => ({
  sendEmail: async (p: { to: string[]; subject: string; html: string }) => {
    if (fake.emailThrows) throw new Error('resend down')
    fake.emails.push(p)
    return { id: 're_1', emailHtml: p.html }
  },
}))
vi.mock('@/lib/email/log', () => ({ logEmail: async () => {} }))

async function submitForm() {
  const { POST } = await import('@/app/api/confirm-details/[token]/route')
  return POST(new Request('http://localhost/api/confirm-details/tok', { method: 'POST' }), {
    params: Promise.resolve({ token: 'tok' }),
  })
}

const PAGE = 'http://localhost/confirm-details/tok'

describe('gig details confirm — plain form post', () => {
  beforeEach(() => {
    fake.reset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('confirms, emails the admins once, and sends the musician back to the page', async () => {
    const res = await submitForm()

    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(PAGE)
    expect(fake.claims).toBe(1)
    expect(fake.emails).toHaveLength(1)
    expect(fake.emails[0].to).toEqual(['admin@example.test'])
    expect(fake.emails[0].subject).toBe('Sam <b>Lee</b> confirmed gig details — Smith Wedding')
    // Names are escaped in the body — a typed "<b>" is text, not markup.
    expect(fake.emails[0].html).toContain('Sam &lt;b&gt;Lee&lt;/b&gt;')
    expect(fake.emails[0].html).toContain('2 of 3 musicians confirmed')
  })

  it('a second submit (already confirmed) sends no second email', async () => {
    fake.claimRows = []

    const res = await submitForm()

    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(PAGE)
    expect(fake.emails).toHaveLength(0)
  })

  it('a failed save returns to the page with an error flag and emails nobody', async () => {
    fake.claimError = { message: 'connection reset' }

    const res = await submitForm()

    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(`${PAGE}?error=1`)
    expect(fake.emails).toHaveLength(0)
  })

  it('email trouble does not undo the confirmation or show the musician an error', async () => {
    fake.emailThrows = true

    const res = await submitForm()

    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(PAGE)
    expect(fake.claims).toBe(1)
  })

  it('an unknown token goes back to the page, which shows "not found"', async () => {
    fake.tokenFound = false

    const res = await submitForm()

    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(PAGE)
    expect(fake.claims).toBe(0)
  })
})
