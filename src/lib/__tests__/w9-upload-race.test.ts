import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Two simultaneous submissions on one W-9 link both pass the token lookup.
// The final save re-checks the token, so only one may repoint the record; the
// loser must remove its own upload and never touch the winner's file.

const fake = vi.hoisted(() => ({
  // What the guarded UPDATE matches: [] once another submission burned the token.
  claimedRows: [{ id: 'mus-1' }] as Array<{ id: string }>,
  updateFilters: [] as Array<[string, unknown]>,
  uploaded: [] as string[],
  removed: [] as string[][],
  reset() {
    this.claimedRows = [{ id: 'mus-1' }]
    this.updateFilters = []
    this.uploaded = []
    this.removed = []
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  getOrgAdminEmails: async () => [],
  createServiceClient: () => ({
    from() {
      let op: 'select' | 'update' = 'select'
      const builder: any = {
        select() {
          if (op === 'update') return Promise.resolve({ data: fake.claimedRows, error: null })
          return builder
        },
        update() {
          op = 'update'
          return builder
        },
        eq(column: string, value: unknown) {
          if (op === 'update') fake.updateFilters.push([column, value])
          return builder
        },
        maybeSingle() {
          return Promise.resolve({
            data: {
              id: 'mus-1',
              first_name: 'Ada',
              last_name: 'L',
              organization_id: 'org-1',
              w9_request_expires_at: null,
              w9_file_url: 'org-1/mus-1/old.pdf',
            },
            error: null,
          })
        },
      }
      return builder
    },
    storage: {
      from: () => ({
        upload: async (path: string) => {
          fake.uploaded.push(path)
          return { error: null }
        },
        remove: async (paths: string[]) => {
          fake.removed.push(paths)
          return { error: null }
        },
      }),
    },
  }),
}))

vi.mock('@/lib/email/send', () => ({ sendEmail: async () => ({ success: true }) }))
vi.mock('@/lib/email/log', () => ({ logEmail: async () => {} }))

async function submit() {
  const { POST } = await import('@/app/api/w9/[token]/route')
  const form = new FormData()
  form.append('file', new File([new Uint8Array([37, 80, 68, 70])], 'w9.pdf', { type: 'application/pdf' }))
  return POST(new Request('http://localhost/api/w9/tok-1', { method: 'POST', body: form }), {
    params: Promise.resolve({ token: 'tok-1' }),
  })
}

describe('W-9 upload — concurrent submissions on one link', () => {
  beforeEach(() => {
    fake.reset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('guards the final save on the token still being unused', async () => {
    const res = await submit()

    expect(res.status).toBe(200)
    expect(fake.updateFilters).toContainEqual(['w9_request_token', 'tok-1'])
    // Winner retires the previous file, never its own.
    expect(fake.removed).toEqual([['org-1/mus-1/old.pdf']])
  })

  it('the losing submission removes only its own upload and reports the link as used', async () => {
    fake.claimedRows = []

    const res = await submit()

    expect(res.status).toBe(409)
    expect(fake.uploaded).toHaveLength(1)
    expect(fake.removed).toEqual([[fake.uploaded[0]]])
    const body = await res.json()
    expect(body.error).toMatch(/already been used/)
  })
})
