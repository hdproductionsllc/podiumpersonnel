import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { MockSupabaseDb, type Row } from './helpers/supabase-mock'

/**
 * Migration 096 (the auto-offer and worker-drop switches, and the cascade's
 * idempotency key) and src/lib/staffing/settings.ts, which reads and writes
 * them. Real-Postgres behaviour is in db/auto-cascade-settings.test.ts.
 */

const state = vi.hoisted(() => ({ db: undefined as unknown as MockSupabaseDb }))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => state.db,
}))

import {
  MUSIC_VERTICALS,
  defaultAllowWorkerDrop,
  getAutoCascadeDisabledChairIds,
  getOrgStaffingSettings,
  setChairAutoCascade,
} from '@/lib/staffing/settings'
import { VERTICAL_KEYS } from '@/lib/verticals'
import { updateOrganizationSchema } from '@/lib/validations/settings'

const read = (rel: string) => readFileSync(resolve(__dirname, '../../..', rel), 'utf-8').replace(/\r\n/g, '\n')
const migration = read('supabase/migrations/096_auto_cascade_settings.sql')
const paste = read('scripts/sql/096-auto-cascade-settings.paste.sql')
const code = (sql: string) => sql.replace(/--.*$/gm, '')

describe('migration 096 and its paste script', () => {
  it('the paste script carries the migration verbatim, inside one transaction, and records 096', () => {
    const begin = paste.indexOf('\nBEGIN;\n')
    const commit = paste.indexOf('\nCOMMIT;\n')
    expect(begin).toBeGreaterThan(0)
    expect(commit).toBeGreaterThan(begin)
    expect(paste.slice(begin, commit)).toContain(migration.trim())
    expect(paste.slice(begin, commit)).toContain("VALUES ('096', '096_auto_cascade_settings')")
  })

  it('ends with a RESULTS table', () => {
    expect(paste.slice(paste.indexOf('\nCOMMIT;\n'))).toMatch(/RESULTS[\s\S]*'PASS'/)
  })

  it('auto-offer is off for every organization, and every chair is in by default', () => {
    expect(code(migration)).toMatch(/ADD COLUMN IF NOT EXISTS auto_cascade boolean NOT NULL DEFAULT false;/)
    expect(code(migration)).toMatch(/ADD COLUMN IF NOT EXISTS auto_cascade_disabled boolean NOT NULL DEFAULT false;/)
    // Nothing turns it on.
    expect(code(migration)).not.toMatch(/SET\s+auto_cascade\s*=\s*true/i)
  })

  it('worker drop defaults by vertical, with the same music list as the app', () => {
    const list = MUSIC_VERTICALS.map((v) => `'${v}'`).join(', ')
    // Existing rows, and the BEFORE INSERT trigger for new ones.
    expect(code(migration).split(`NOT IN (${list})`).length - 1).toBe(2)
    expect(code(migration)).toMatch(/WHERE allow_worker_drop IS NULL;/) // never overwrites an admin's choice
    expect(code(migration)).toContain('BEFORE INSERT ON organizations')
    expect(code(migration)).toContain('ALTER COLUMN allow_worker_drop SET NOT NULL')
  })

  it('one triggering offer can cause at most one cascaded offer (the idempotency key)', () => {
    expect(code(migration)).toMatch(
      /ADD COLUMN IF NOT EXISTS cascaded_from_offer_id uuid\s+REFERENCES contract_offers\(id\) ON DELETE SET NULL;/
    )
    expect(code(migration)).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS contract_offers_one_cascade_per_trigger\s+ON contract_offers \(cascaded_from_offer_id\)/
    )
  })

  it('the cascade functions are SECURITY DEFINER where they write, pinned to public, and the server\'s only', () => {
    const body = (fn: string) => {
      const sql = code(migration)
      const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${fn}(`)
      expect(start, fn).toBeGreaterThan(0)
      return sql.slice(start, sql.indexOf('$$;', start))
    }
    for (const fn of ['cascade_offer', 'mark_cascade_exhausted']) {
      expect(body(fn).slice(0, body(fn).indexOf('AS $$'))).toMatch(/SECURITY DEFINER\s+SET search_path = public, pg_temp/)
    }
    expect(body('cascade_refusal')).toMatch(/SET search_path = public, pg_temp/)
    for (const sig of [
      'cascade_refusal(UUID)',
      'cascade_offer(UUID, UUID, TIMESTAMPTZ, NUMERIC, JSONB, TEXT)',
      'mark_cascade_exhausted(UUID, JSONB)',
    ]) {
      expect(code(migration)).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${sig.replace(/[()]/g, '\\$&')}\\s+FROM PUBLIC, anon, authenticated;`))
      expect(code(migration)).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${sig.replace(/[()]/g, '\\$&')}\\s+TO service_role;`))
    }
  })

  it('both cascade writes lock the chair first and check every reason to stop', () => {
    for (const fn of ['cascade_offer', 'mark_cascade_exhausted']) {
      const sql = code(migration)
      const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${fn}(`)
      const body = sql.slice(start, sql.indexOf('$$;', start))
      expect(body.indexOf('FOR UPDATE'), fn).toBeGreaterThan(0)
      expect(body.indexOf('FOR UPDATE')).toBeLessThan(body.indexOf('cascade_refusal(p_trigger_offer_id)'))
    }
    // The reasons, and the app's list of them, agree.
    const refusal = code(migration).slice(code(migration).indexOf('CREATE OR REPLACE FUNCTION cascade_refusal('))
    for (const reason of ['not_found', 'auto_off', 'chair_opted_out', 'gig_closed', 'gig_not_active', 'trigger_not_ended', 'already_cascaded', 'already_exhausted', 'chair_filled', 'chair_has_live_offer']) {
      expect(refusal).toContain(`'${reason}'`)
    }
    expect(code(migration)).toMatch(/ADD COLUMN IF NOT EXISTS cascade_exhausted_at timestamptz;/)
  })

  it('deletes nothing and touches no billing or library column', () => {
    expect(code(migration)).not.toMatch(/\bDELETE FROM\b|\bTRUNCATE\b|\bDROP COLUMN\b|\bDROP TABLE\b/i)
    expect(code(migration)).not.toMatch(/is_comped|plan_tier|library_org_id|intake_enabled/)
  })
})

describe('the switches are the org admin\'s to set', () => {
  it('081 does not freeze them (they are behaviour settings, not billing)', () => {
    const guard = read('supabase/migrations/081_protect_privileged_org_columns.sql')
    expect(guard).not.toContain("'auto_cascade'")
    expect(guard).not.toContain("'allow_worker_drop'")
  })

  it('the organization settings form accepts both, and neither is required', () => {
    const base = { name: 'Org', slug: 'org', timezone: 'America/Chicago' }
    expect(updateOrganizationSchema.parse({ ...base, auto_cascade: true, allow_worker_drop: false })).toMatchObject({
      auto_cascade: true,
      allow_worker_drop: false,
    })
    expect(updateOrganizationSchema.safeParse(base).success).toBe(true)
    expect(updateOrganizationSchema.safeParse({ ...base, auto_cascade: 'yes' }).success).toBe(false)
  })

  it('the settings route only writes them when sent', () => {
    const route = read('src/app/api/settings/organization/route.ts')
    expect(route).toContain('requireOrgAdmin()')
    expect(route).toMatch(/parsed\.data\.auto_cascade !== undefined/)
    expect(route).toMatch(/parsed\.data\.allow_worker_drop !== undefined/)
  })

  it('the per-chair switch goes through an admin-only route', () => {
    const route = read('src/app/api/positions/[positionId]/auto-cascade/route.ts')
    expect(route).toContain('requireOrgAdmin()')
    expect(route).toContain('setChairAutoCascade(')
  })
})

describe('defaultAllowWorkerDrop', () => {
  it.each(VERTICAL_KEYS)('%s', (vertical) => {
    expect(defaultAllowWorkerDrop(vertical)).toBe(!['music_contractor', 'orchestra_band'].includes(vertical))
  })

  it('an organization with no vertical is a music contractor', () => {
    expect(defaultAllowWorkerDrop(null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------

const client = () => state.db as unknown as SupabaseClient

const missingColumn = { code: '42703', message: 'column organizations.auto_cascade does not exist' }

/** A client whose reads fail with `error` (by default, as they would before 096 is applied). */
function before096(error: { code: string; message: string } = missingColumn): SupabaseClient {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'update']) chain[m] = () => chain
  chain.maybeSingle = async () => ({ data: null, error })
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error })
  return { from: () => chain } as unknown as SupabaseClient
}

describe('reading the switches', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.db = new MockSupabaseDb({
      organizations: [{ id: 'org-1', auto_cascade: true, allow_worker_drop: false }],
      project_positions: [
        { id: 'pos-1', auto_cascade_disabled: true, project: { organization_id: 'org-1' } },
        { id: 'pos-2', auto_cascade_disabled: false, project: { organization_id: 'org-1' } },
      ],
      staffing_events: [],
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('returns the organization\'s two switches', async () => {
    expect(await getOrgStaffingSettings(client(), 'org-1')).toEqual({ autoCascade: true, allowWorkerDrop: false })
  })

  it('returns null before 096 is applied, and says why once per server process, not on every decline', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await getOrgStaffingSettings(before096(), 'org-1')).toBeNull()
    expect(await getAutoCascadeDisabledChairIds(before096(), 'org-1')).toBeNull()
    expect(await getOrgStaffingSettings(before096(), 'org-1')).toBeNull()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0][0])).toContain('migration 096')
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('any other read failure is logged every time', async () => {
    const timeout = { code: '57014', message: 'canceling statement due to statement timeout' }
    expect(await getOrgStaffingSettings(before096(timeout), 'org-1')).toBeNull()
    expect(await getOrgStaffingSettings(before096(timeout), 'org-1')).toBeNull()
    expect(errorSpy).toHaveBeenCalledTimes(2)
  })

  it('setChairAutoCascade refuses with not_ready before 096, changing nothing', async () => {
    const result = await setChairAutoCascade(before096(), 'user-admin', 'pos-1', true)
    expect(result).toMatchObject({ ok: false, status: 503, code: 'not_ready' })
  })

  it('switches a chair out of auto-offer and records who did it', async () => {
    const result = await setChairAutoCascade(client(), 'user-admin', 'pos-2', true)
    expect(result).toEqual({ ok: true, disabled: true, changed: true })
    expect(state.db.row('project_positions', 'pos-2')!.auto_cascade_disabled).toBe(true)
    const events = state.db.tables.staffing_events as Row[]
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      organization_id: 'org-1',
      actor_type: 'admin',
      actor_id: 'user-admin',
      entity_type: 'position',
      entity_id: 'pos-2',
      action: 'position.auto_cascade_changed',
      before: { auto_cascade_disabled: false },
      after: { auto_cascade_disabled: true },
    })
  })

  it('setting it to what it already is changes and records nothing', async () => {
    const result = await setChairAutoCascade(client(), 'user-admin', 'pos-1', true)
    expect(result).toEqual({ ok: true, disabled: true, changed: false })
    expect(state.db.tables.staffing_events).toHaveLength(0)
  })

  it('a chair the session cannot see reads as not found', async () => {
    expect(await setChairAutoCascade(client(), 'user-admin', 'pos-nope', true)).toMatchObject({
      ok: false,
      status: 404,
      code: 'not_found',
    })
  })
})
