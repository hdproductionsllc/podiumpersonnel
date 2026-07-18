import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import { MockSupabaseDb, type Row } from './helpers/supabase-mock'

/**
 * BEHAVIORAL tests for the musician OAuth/email callback route
 * (src/app/musician/auth/callback/route.ts) — the point where a freshly
 * signed-up or returning musician is routed after Supabase exchanges the code
 * for a session.
 *
 * These lock in the post-signup-rework contract: registration no longer
 * requires a pre-existing musicians row. A user whose email matches no roster
 * entry is no longer signed out and rejected — the callback proceeds and lands
 * them in the portal. The three routing branches are asserted directly:
 *   - org member (no roster)   → /dashboard
 *   - linked musician(s)       → the `next` target (portal by default)
 *   - no roster, no membership → the `next` target, WITHOUT signOut
 *
 * The Supabase server client is faked: `from` is delegated to the in-memory
 * MockSupabaseDb (so row reads/writes are real), while `auth` and `rpc` are
 * spies. Email sending is mocked at the module boundary. Every test asserts
 * console.error was not called so a broken fake can't false-green a redirect.
 */

const state = vi.hoisted(() => ({ client: undefined as any }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => state.client),
}))

vi.mock('@/lib/email/send', () => ({
  sendMusicianWelcomeEmail: vi.fn(async () => ({ id: 'em-welcome' })),
}))

import { GET } from '@/app/musician/auth/callback/route'
import { sendMusicianWelcomeEmail } from '@/lib/email/send'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORIGIN = 'https://app.example.com'
const USER = { id: 'user-1', email: 'New.Musician@Example.com' }

/**
 * Wraps a MockSupabaseDb with the `auth` + `rpc` surface the callback uses.
 * `signOut` is a spy that the current route must never call — its absence is
 * the whole point of the no-roster branch.
 */
function makeClient(
  db: MockSupabaseDb,
  opts: { user?: Row | null; exchangeError?: { message: string } | null } = {}
) {
  const { user = USER, exchangeError = null } = opts
  return {
    auth: {
      exchangeCodeForSession: vi.fn(async () => ({
        data: { user }, error: exchangeError,
      })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    rpc: vi.fn(async () => ({ data: null, error: null })),
    from: (table: string) => db.from(table),
  }
}

function makeMusician(over: Partial<Row> = {}): Row {
  return {
    id: 'mus-1',
    user_id: 'user-1',
    first_name: 'Mia',
    last_name: 'Musician',
    portal_last_login: null,
    organization: { name: 'Test Orchestra' },
    ...over,
  }
}

function callbackRequest(params: Record<string, string> = {}): Request {
  const url = new URL(`${ORIGIN}/musician/auth/callback`)
  url.searchParams.set('code', 'auth-code')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new Request(url.toString())
}

let errorSpy: MockInstance

beforeEach(() => {
  vi.clearAllMocks()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// No-roster signup — the register rework
// ---------------------------------------------------------------------------

describe('callback — unknown email with no roster row', () => {
  it('proceeds into the portal instead of rejecting, and never signs the user out', async () => {
    const db = new MockSupabaseDb({ musicians: [], organization_members: [] })
    state.client = makeClient(db)

    const res = await GET(callbackRequest())

    // Signup for an email that matches no musicians row still lands in the portal.
    expect(res.headers.get('location')).toBe(`${ORIGIN}/musician`)
    expect(state.client.auth.signOut).not.toHaveBeenCalled()
    expect(sendMusicianWelcomeEmail).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('honors the next target for a no-roster user', async () => {
    const db = new MockSupabaseDb({ musicians: [], organization_members: [] })
    state.client = makeClient(db)

    const res = await GET(callbackRequest({ next: '/musician/portal' }))

    expect(res.headers.get('location')).toBe(`${ORIGIN}/musician/portal`)
    expect(state.client.auth.signOut).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('links roster records by lowercased email before routing', async () => {
    const db = new MockSupabaseDb({ musicians: [], organization_members: [] })
    state.client = makeClient(db)

    await GET(callbackRequest())

    expect(state.client.rpc).toHaveBeenCalledWith('link_musician_records_to_user', {
      p_user_id: 'user-1',
      p_email: 'new.musician@example.com',
    })
    expect(errorSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Org member (no roster) — admin who landed on the musician login
// ---------------------------------------------------------------------------

describe('callback — org member without a roster row', () => {
  it('redirects to the admin dashboard', async () => {
    const db = new MockSupabaseDb({
      musicians: [],
      organization_members: [{ id: 'om-1', user_id: 'user-1' }],
    })
    state.client = makeClient(db)

    const res = await GET(callbackRequest({ next: '/musician/portal' }))

    // Admins go to /dashboard, ignoring the musician `next` target.
    expect(res.headers.get('location')).toBe(`${ORIGIN}/dashboard`)
    expect(state.client.auth.signOut).not.toHaveBeenCalled()
    expect(sendMusicianWelcomeEmail).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Linked musician(s) — the returning-portal-user path
// ---------------------------------------------------------------------------

describe('callback — linked musician records', () => {
  it('redirects to the next target and stamps portal_last_login', async () => {
    const db = new MockSupabaseDb({
      musicians: [makeMusician({ portal_last_login: '2026-01-01T00:00:00.000Z' })],
    })
    state.client = makeClient(db)

    const res = await GET(callbackRequest({ next: '/musician/portal' }))

    expect(res.headers.get('location')).toBe(`${ORIGIN}/musician/portal`)
    expect(db.row('musicians', 'mus-1')!.portal_last_login).not.toBe('2026-01-01T00:00:00.000Z')

    // A returning musician (already logged in once) gets no welcome email.
    expect(sendMusicianWelcomeEmail).not.toHaveBeenCalled()
    expect(state.client.auth.signOut).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('defaults to /musician when no next target is supplied', async () => {
    const db = new MockSupabaseDb({ musicians: [makeMusician()] })
    state.client = makeClient(db)

    const res = await GET(callbackRequest())

    expect(res.headers.get('location')).toBe(`${ORIGIN}/musician`)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('sends the welcome email on the first-ever login', async () => {
    const db = new MockSupabaseDb({
      musicians: [makeMusician({ portal_last_login: null })],
    })
    state.client = makeClient(db)

    await GET(callbackRequest())

    expect(sendMusicianWelcomeEmail).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(sendMusicianWelcomeEmail).mock.calls[0][0]
    expect(arg.to).toBe('New.Musician@Example.com')
    expect(arg.musicianName).toBe('Mia Musician')
    expect(arg.organizations).toEqual(['Test Orchestra'])
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('links by activation token first when one is present', async () => {
    const db = new MockSupabaseDb({ musicians: [makeMusician()] })
    state.client = makeClient(db)

    await GET(callbackRequest({ activation_token: 'act-123' }))

    expect(state.client.rpc).toHaveBeenCalledWith('activate_musician_by_token', {
      p_user_id: 'user-1',
      p_token: 'act-123',
    })
    expect(errorSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Failure — code exchange rejected
// ---------------------------------------------------------------------------

describe('callback — exchange failure', () => {
  it('redirects to the login error page when the code cannot be exchanged', async () => {
    const db = new MockSupabaseDb({})
    state.client = makeClient(db, { user: null, exchangeError: { message: 'bad code' } })

    const res = await GET(callbackRequest())

    expect(res.headers.get('location')).toBe(`${ORIGIN}/musician/login?error=auth_callback_error`)
  })

  it('redirects to the login error page when no code is present', async () => {
    const db = new MockSupabaseDb({})
    state.client = makeClient(db)

    const res = await GET(new Request(`${ORIGIN}/musician/auth/callback`))

    expect(res.headers.get('location')).toBe(`${ORIGIN}/musician/login?error=auth_callback_error`)
    expect(state.client.auth.exchangeCodeForSession).not.toHaveBeenCalled()
  })
})
