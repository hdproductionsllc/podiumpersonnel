import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createRequire } from 'module'

/**
 * scripts/preview-auto-cascade.js runs against PRODUCTION, so it must be
 * read-only by construction: every request goes through getOnlyFetch, and the
 * app's writing server clients are replaced by stubs that throw.
 */

const root = resolve(__dirname, '../../..')
const requireCjs = createRequire(import.meta.url)
const { getOnlyFetch } = requireCjs(resolve(root, 'scripts/preview-auto-cascade.js')) as {
  getOnlyFetch: (input: unknown, init?: { method?: string }) => Promise<unknown>
}
const stub = requireCjs(resolve(root, 'scripts/lib/read-only-supabase-server.js')) as Record<string, () => unknown>
const source = readFileSync(resolve(root, 'scripts/preview-auto-cascade.js'), 'utf8')

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('preview-auto-cascade is read-only', () => {
  it.each(['POST', 'PATCH', 'PUT', 'DELETE', 'post'])('refuses a %s request before it leaves the machine', async (method) => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(getOnlyFetch('https://example.test/rest/v1/organizations', { method })).rejects.toThrow(/read-only/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('lets GET and HEAD through', async () => {
    const fetchSpy = vi.fn(async () => 'ok')
    vi.stubGlobal('fetch', fetchSpy)
    await getOnlyFetch('https://example.test/rest/v1/organizations')
    await getOnlyFetch('https://example.test/rest/v1/organizations', { method: 'HEAD' })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('builds its client on getOnlyFetch, and calls nothing that writes', () => {
    expect(source).toMatch(/global: \{ fetch: getOnlyFetch \}/)
    expect(source).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/)
    expect(source).toContain("'@/lib/supabase/server': path.join(__dirname, 'lib', 'read-only-supabase-server.js')")
  })

  it('the stand-in server clients throw instead of writing', () => {
    for (const fn of ['createClient', 'createServiceClient', 'getOrgAdminEmails', 'getOrgOwnerEmail']) {
      expect(() => stub[fn](), fn).toThrow(/read-only/)
    }
  })

  it('plans with the app\'s own planner, assuming auto-offer on', () => {
    expect(source).toContain("'src', 'lib', 'staffing', 'cascade-plan.ts'")
    expect(source).toMatch(/assume: \{ autoCascadeOn: true, triggerEnded: true \}/)
  })
})
