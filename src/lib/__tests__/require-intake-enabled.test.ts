import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * BEHAVIORAL tests for requireIntakeEnabled() (src/lib/api-helpers.ts).
 *
 * The gate composes requireOrgAdmin() (auth + owner/admin membership) with an
 * admin-client read of organizations.intake_enabled. It must:
 *
 *   1. Fail CLOSED with 404 when intake_enabled is false — the internal
 *      feature is never advertised, so it returns 404 (never 403) and drops
 *      membership to null.
 *   2. Fail CLOSED with 404 when the org lookup errors (missing column /
 *      query error) — a lookup failure must not leak the feature.
 *   3. Pass through with membership intact when intake_enabled is true.
 *   4. Propagate an upstream requireOrgAdmin() failure unchanged (original
 *      status, membership null), never touching the admin client.
 *
 * Seam: module-mock the supabase server + admin client factories, same as the
 * sibling behavioral suites (see cron-expire-behavior.test.ts). Hoisted holders
 * let each test drive the auth user, the membership row, and the organizations
 * read independently.
 */

const state = vi.hoisted(() => ({
  authUser: undefined as any,
  membership: undefined as { data: any } | undefined,
  orgRead: undefined as { data: any; error: any } | undefined,
  adminFromCalls: [] as string[],
}))

function serverChain(result: { data: any }) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    single: async () => result,
  }
  return chain
}

function adminChain(result: { data: any; error: any }) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    single: async () => result,
  }
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.authUser } }),
    },
    from: (table: string) => {
      if (table === 'organization_members') {
        return serverChain(state.membership ?? { data: null })
      }
      throw new Error(`unexpected server table ${table}`)
    },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      state.adminFromCalls.push(table)
      if (table === 'organizations') {
        return adminChain(state.orgRead ?? { data: null, error: null })
      }
      throw new Error(`unexpected admin table ${table}`)
    },
  }),
}))

import { requireIntakeEnabled } from '@/lib/api-helpers'

const USER = { id: 'user-1' }
const MEMBERSHIP = { organization_id: 'org-1', role: 'owner' }

beforeEach(() => {
  state.authUser = USER
  state.membership = { data: MEMBERSHIP }
  state.orgRead = { data: { intake_enabled: true }, error: null }
  state.adminFromCalls = []
})

describe('requireIntakeEnabled', () => {
  it('fails closed with 404 and null membership when intake_enabled is false', async () => {
    state.orgRead = { data: { intake_enabled: false }, error: null }

    const { user, membership, error } = await requireIntakeEnabled()

    expect(membership).toBeNull()
    expect(user).toEqual(USER)
    expect(error).not.toBeNull()
    expect(error!.status).toBe(404)
    const body = await error!.json()
    expect(body).toEqual({ error: 'Not found' })
  })

  it('fails closed with 404 when the org lookup errors (e.g. missing column)', async () => {
    state.orgRead = {
      data: null,
      error: { message: 'column organizations.intake_enabled does not exist', code: '42703' },
    }

    const { membership, error } = await requireIntakeEnabled()

    expect(membership).toBeNull()
    expect(error).not.toBeNull()
    expect(error!.status).toBe(404)
    const body = await error!.json()
    expect(body).toEqual({ error: 'Not found' })
  })

  it('passes through with membership intact when intake_enabled is true', async () => {
    const { user, membership, error } = await requireIntakeEnabled()

    expect(error).toBeNull()
    expect(user).toEqual(USER)
    expect(membership).toEqual(MEMBERSHIP)
    expect(state.adminFromCalls).toContain('organizations')
  })

  it('propagates an upstream requireOrgAdmin failure unchanged and skips the org read', async () => {
    state.authUser = null

    const { user, membership, error } = await requireIntakeEnabled()

    expect(membership).toBeNull()
    expect(user).toBeNull()
    expect(error).not.toBeNull()
    expect(error!.status).toBe(401)
    expect(state.adminFromCalls).toEqual([])
  })

  it('propagates a 403 permission failure unchanged (non-admin member never reaches the flag)', async () => {
    state.membership = { data: { organization_id: 'org-1', role: 'member' } }

    const { membership, error } = await requireIntakeEnabled()

    expect(membership).toBeNull()
    expect(error).not.toBeNull()
    expect(error!.status).toBe(403)
    expect(state.adminFromCalls).toEqual([])
  })
})
