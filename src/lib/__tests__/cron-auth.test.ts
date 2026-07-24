import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

// @/lib/cron re-exports notifyOps, which pulls in the Resend client — and that
// constructor throws on an empty key at module load. Seed a dummy key and
// import dynamically, matching email-safe-mode.test.ts.
let requireCronAuth: (request: Request) => { status: number } | null

beforeAll(async () => {
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test_dummy'
  ;({ requireCronAuth } = await import('@/lib/cron'))
})

/**
 * The cron routes fan out email to every musician with a pending offer, so an
 * unauthenticated one is a mass-mail trigger against the whole database.
 *
 * The original inline check in each route was:
 *
 *   if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) return 401
 *
 * which fails OPEN when CRON_SECRET is unset — the template collapses to the
 * literal "Bearer undefined" and anyone sending that header gets in.
 */

const SECRET = 'test-cron-secret-value'

function req(authHeader?: string): Request {
  return new Request('https://example.com/api/cron/expire-offers', {
    headers: authHeader ? { authorization: authHeader } : {},
  })
}

describe('requireCronAuth', () => {
  const original = process.env.CRON_SECRET

  beforeEach(() => {
    process.env.CRON_SECRET = SECRET
  })

  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = original
  })

  it('allows the correct bearer token through', () => {
    expect(requireCronAuth(req(`Bearer ${SECRET}`))).toBeNull()
  })

  it('rejects a wrong token', async () => {
    const res = requireCronAuth(req('Bearer wrong-value'))
    expect(res?.status).toBe(401)
  })

  it('rejects a missing Authorization header', () => {
    expect(requireCronAuth(req())?.status).toBe(401)
  })

  it('rejects the bare secret without the Bearer prefix', () => {
    expect(requireCronAuth(req(SECRET))?.status).toBe(401)
  })

  describe('fails closed on misconfiguration', () => {
    it('denies everything when CRON_SECRET is unset', () => {
      delete process.env.CRON_SECRET

      // The exact string the old template literal produced. This is the request
      // an attacker sends once they guess the secret is missing.
      expect(requireCronAuth(req('Bearer undefined'))?.status).toBe(401)
      expect(requireCronAuth(req('Bearer '))?.status).toBe(401)
      expect(requireCronAuth(req())?.status).toBe(401)
    })

    it('denies everything when CRON_SECRET is blank', () => {
      process.env.CRON_SECRET = '   '

      expect(requireCronAuth(req('Bearer    '))?.status).toBe(401)
      expect(requireCronAuth(req('Bearer '))?.status).toBe(401)
      expect(requireCronAuth(req())?.status).toBe(401)
    })
  })
})

describe('cron routes all use the shared guard', () => {
  const CRON_DIR = join(process.cwd(), 'src', 'app', 'api', 'cron')

  const routeFiles = readdirSync(CRON_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ job: d.name, path: join(CRON_DIR, d.name, 'route.ts') }))

  it('finds the cron routes', () => {
    // Guards against the sweep below passing because the directory moved.
    expect(routeFiles.length).toBeGreaterThanOrEqual(6)
  })

  it.each(routeFiles)('$job calls requireCronAuth', ({ path }) => {
    expect(readFileSync(path, 'utf8')).toContain('requireCronAuth(request)')
  })

  it.each(routeFiles)('$job does not hand-roll the CRON_SECRET check', ({ path }) => {
    // The fail-open comparison must not creep back into a route.
    expect(readFileSync(path, 'utf8')).not.toContain('process.env.CRON_SECRET')
  })
})
