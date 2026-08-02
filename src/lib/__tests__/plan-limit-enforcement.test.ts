import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { execSync } from 'child_process'
import { resolve } from 'path'
import { PLAN_LIMITS, resolveOrgPlan, type OrgBilling } from '@/lib/plan'

/**
 * Musicians and projects are written client-side, straight to PostgREST under
 * RLS — no API route in between. So canAddMusician/canCreateProject only ever
 * disabled a button, and the caps were bypassable by anyone with devtools.
 * Migration 080 moves the enforcement to where the row is actually created.
 *
 * That leaves two copies of the same rules — TypeScript for the UI, PL/pgSQL for
 * the database — and a silent drift between them is worse than either alone: the
 * UI would allow what the trigger rejects, or the trigger would cap someone the
 * UI told was fine. These assert the SQL still says what PLAN_LIMITS says.
 *
 * The trigger BEHAVIOUR (limits actually blocking inserts, the
 * create-as-completed bypass, comped orgs passing through) was verified by
 * applying 080 to a real PostgreSQL 16 and exercising each path; these tests
 * guard the numbers, which are what drift.
 */

const sql = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/080_enforce_plan_limits.sql'),
  'utf-8'
)

/**
 * The CASE arm for one limit inside org_plan_limit(). Sliced between the named
 * outer arm and the next one — the inner `CASE t WHEN 'free' ...` means a naive
 * search for the next "WHEN '" lands inside the arm rather than after it.
 */
const OUTER_ARMS = [
  "WHEN 'musicians' THEN",
  "WHEN 'active_projects' THEN",
  // The outer CASE's own ELSE, with its indentation — an inner "ELSE NULL END"
  // closes each arm, so a bare search would stop short.
  '\n    ELSE NULL\n  END;',
]
function limitArm(name: string): string {
  const marker = `WHEN '${name}' THEN`
  const start = sql.indexOf(marker)
  expect(start, `no CASE arm for ${name}`).toBeGreaterThan(-1)
  const next = OUTER_ARMS[OUTER_ARMS.indexOf(marker) + 1]
  const end = sql.indexOf(next, start + marker.length)
  expect(end, `could not find the end of the ${name} arm`).toBeGreaterThan(start)
  return sql.slice(start, end)
}

describe('the SQL limits match PLAN_LIMITS', () => {
  it('caps performers per tier exactly as the app does', () => {
    const arm = limitArm('musicians')
    for (const tier of ['free', 'ensemble', 'orchestra'] as const) {
      const n = PLAN_LIMITS[tier].musicians
      expect(Number.isFinite(n), `${tier} should be finite in this list`).toBe(true)
      expect(arm, `${tier} performer cap missing or wrong in SQL`).toMatch(
        new RegExp(`WHEN '${tier}' THEN ${n}\\b`)
      )
    }
  })

  it('leaves symphony uncapped, matching Infinity', () => {
    expect(PLAN_LIMITS.symphony.musicians).toBe(Infinity)
    // NULL is how the function spells "unlimited"; the trigger returns early on it.
    expect(limitArm('musicians')).toContain('ELSE NULL')
    expect(sql).toContain('IF lim IS NULL THEN')
  })

  it('caps active projects only on free, matching Infinity elsewhere', () => {
    expect(PLAN_LIMITS.free.activeProjects).toBe(3)
    expect(PLAN_LIMITS.ensemble.activeProjects).toBe(Infinity)
    expect(PLAN_LIMITS.orchestra.activeProjects).toBe(Infinity)
    expect(limitArm('active_projects')).toMatch(/WHEN 'free' THEN 3\b/)
    expect(limitArm('active_projects')).toContain('ELSE NULL')
  })

  it('counts an active project the same way the dashboard does', () => {
    // projects-client.tsx: status === 'active' || status === 'draft'
    const client = readFileSync(
      resolve(__dirname, '../../components/projects/projects-client.tsx'),
      'utf-8'
    )
    expect(client).toContain("p.status === 'active' || p.status === 'draft'")
    expect(sql).toContain("NEW.status NOT IN ('active', 'draft')")
    expect(sql).toContain("AND status IN ('active', 'draft')")
  })
})

describe('the SQL tier resolution matches resolveOrgPlan', () => {
  // resolveOrgPlan short-circuits everything to symphony while billing is off,
  // which would make every comparison below trivially pass. These cases are
  // about the post-launch behaviour, so enforcement has to be on.
  beforeEach(() => {
    process.env.NEXT_PUBLIC_BILLING_ENABLED = 'true'
  })
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_BILLING_ENABLED
  })

  const base: OrgBilling = {
    plan_tier: null,
    trial_ends_at: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: null,
    is_comped: null,
  }

  it('puts comped orgs on symphony first, before anything else', () => {
    // Founding members must survive enforcement being switched on. Order
    // matters: this is checked before the billing_enforced short-circuit in
    // both implementations.
    expect(resolveOrgPlan({ ...base, is_comped: true }).tier).toBe('symphony')
    const fn = sql.slice(sql.indexOf('FUNCTION org_plan_tier'))
    expect(fn.indexOf('is_comped')).toBeLessThan(fn.indexOf('billing_enforced'))
  })

  it('keeps past_due in grace rather than dropping to free', () => {
    const plan = resolveOrgPlan({ ...base, subscription_status: 'past_due', plan_tier: 'orchestra' })
    expect(plan.tier).toBe('orchestra')
    expect(sql).toContain("IN ('active', 'trialing', 'past_due')")
  })

  it('falls back to ensemble on an unrecognised plan_tier', () => {
    const plan = resolveOrgPlan({ ...base, subscription_status: 'active', plan_tier: 'nonsense' })
    expect(plan.tier).toBe('ensemble')
    expect(sql).toContain("ELSE 'ensemble'")
  })

  it('gives an unexpired trial full access', () => {
    const future = new Date(Date.now() + 5 * 86400_000).toISOString()
    expect(resolveOrgPlan({ ...base, trial_ends_at: future }).tier).toBe('symphony')
    expect(sql).toContain('o.trial_ends_at > now()')
  })

  it('drops to free once the trial has expired', () => {
    const past = new Date(Date.now() - 86400_000).toISOString()
    expect(resolveOrgPlan({ ...base, trial_ends_at: past }).tier).toBe('free')
    expect(sql).toMatch(/RETURN 'free';/)
  })
})

describe('080 is safe to apply before launch', () => {
  it('defaults enforcement OFF, so applying it changes nothing today', () => {
    expect(sql).toContain('billing_enforced BOOLEAN NOT NULL DEFAULT false')
  })

  it('does not reset the switch when re-run', () => {
    // The seed must not clobber a live "true" on a second apply.
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING')
  })

  it('cannot grow a second settings row that would shadow the first', () => {
    expect(sql).toContain('id               BOOLEAN PRIMARY KEY DEFAULT true CHECK (id)')
  })

  it('locks search_path on every SECURITY DEFINER function', () => {
    // A definer function without a pinned search_path can be hijacked by a
    // caller-controlled schema.
    // Only the function attribute, on its own line — the phrase also appears
    // in a comment explaining why app_settings needs no policy.
    const definers = (sql.match(/^SECURITY DEFINER$/gm) ?? []).length
    const pinned = (sql.match(/^SET search_path = public, pg_temp$/gm) ?? []).length
    expect(definers).toBeGreaterThanOrEqual(4)
    expect(pinned).toBe(definers)
  })

  it('keeps app_settings unreachable through PostgREST', () => {
    expect(sql).toContain('ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY')
    const settings = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS app_settings'), sql.indexOf('org_plan_tier'))
    expect(settings).not.toMatch(/CREATE POLICY/i)
  })

  it('documents that both switches flip together', () => {
    // Only the app flag → the DB still lets writes through. Only the DB flag →
    // inserts fail with no upgrade prompt explaining why.
    expect(sql).toContain('NEXT_PUBLIC_BILLING_ENABLED=true')
    expect(sql).toContain('UPDATE app_settings SET billing_enforced = true;')
  })
})

describe('.env.example matches what the code actually reads', () => {
  const envExample = readFileSync(resolve(__dirname, '../../../.env.example'), 'utf-8')
  const documented = new Set(
    envExample.split('\n').map((l) => /^([A-Z0-9_]+)=/.exec(l)?.[1]).filter(Boolean) as string[]
  )

  it('documents every Stripe price var plan.ts resolves tiers through', () => {
    // The old file said STRIPE_PRO_PRICE_ID, from a two-tier model that no
    // longer exists. Configuring Stripe from it left priceIdToTier() returning
    // null for every subscription.
    for (const v of ['STRIPE_ENSEMBLE_PRICE_ID', 'STRIPE_ORCHESTRA_PRICE_ID', 'STRIPE_SYMPHONY_PRICE_ID']) {
      expect(documented, `${v} is read by plan.ts but not documented`).toContain(v)
    }
    expect(documented).not.toContain('STRIPE_PRO_PRICE_ID')
  })

  it('documents the billing master switch and its database twin', () => {
    expect(documented).toContain('NEXT_PUBLIC_BILLING_ENABLED')
    expect(envExample).toContain('UPDATE app_settings SET billing_enforced = true;')
  })

  it('documents the R2 vars the library cannot run without', () => {
    for (const v of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) {
      expect(documented, `${v} missing`).toContain(v)
    }
  })

  it('names the from-address vars the email client actually reads', () => {
    // EMAIL_FROM is a DERIVED export, not an input. Documenting it as settable
    // meant a configured from-address silently did nothing and mail went out
    // from the hardcoded default — which fails outright if that domain is not
    // verified in Resend.
    const client = readFileSync(resolve(__dirname, '../email/client.ts'), 'utf-8')
    expect(client).toContain('process.env.EMAIL_FROM_ADDRESS')
    // \b stops before an underscore, so this matches a bare EMAIL_FROM read
    // without false-matching EMAIL_FROM_ADDRESS / EMAIL_FROM_NAME.
    expect(client).not.toMatch(/process\.env\.EMAIL_FROM\b/)
    expect(documented).toContain('EMAIL_FROM_ADDRESS')
    expect(documented).toContain('EMAIL_FROM_NAME')
    expect(documented).not.toContain('EMAIL_FROM')
  })

  it('has no documented var the code never reads', () => {
    // Every entry here should be actionable. A stale one is worse than a
    // missing one: it reads as configured when nothing is listening.
    const src = ['src/lib', 'src/app', 'src/components']
      .map((d) => execSync(`grep -rhoE "process\\.env\\.[A-Z0-9_]+" ${d} || true`, {
        cwd: resolve(__dirname, '../../..'), encoding: 'utf-8',
      }))
      .join('\n')
    const read = new Set(src.split('\n').map((l) => l.replace('process.env.', '').trim()).filter(Boolean))
    // R2_* are read dynamically through the R2_ENV_VARS list, not by literal
    // property access, so they never appear in that grep.
    const dynamic = new Set(['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'])
    const stale = [...documented].filter((v) => !read.has(v) && !dynamic.has(v))
    expect(stale, `documented but never read: ${stale.join(', ')}`).toEqual([])
  })
})
