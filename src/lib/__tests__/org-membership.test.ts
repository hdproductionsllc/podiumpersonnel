import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import {
  checkInviteEligibility,
  ALREADY_IN_ANOTHER_ORG_MESSAGE,
  ALREADY_IN_THIS_ORG_MESSAGE,
} from '@/lib/org-membership'

/**
 * One account = one organization.
 *
 * The invite route used to check only whether the target was already in the
 * INVITING org, so inviting someone who owned another org gave them a second
 * membership. That silently broke the invitee: ~38 routes resolve the caller's
 * org with .single(), which returns nothing for two rows, while the hardened
 * dashboard shell still rendered — a healthy-looking UI where every action
 * failed.
 */

const ORG_A = '11111111-1111-1111-1111-111111111111'
const ORG_B = '22222222-2222-2222-2222-222222222222'
const ORG_C = '33333333-3333-3333-3333-333333333333'

describe('checkInviteEligibility', () => {
  it('allows an account with no memberships', () => {
    expect(checkInviteEligibility([], ORG_A)).toEqual({ allowed: true })
  })

  it('rejects an account already in the inviting org', () => {
    const result = checkInviteEligibility([{ organization_id: ORG_A }], ORG_A)

    expect(result).toEqual({
      allowed: false,
      status: 409,
      error: ALREADY_IN_THIS_ORG_MESSAGE,
    })
  })

  it('rejects an account that belongs to a different org', () => {
    // The regression this module exists for.
    const result = checkInviteEligibility([{ organization_id: ORG_B }], ORG_A)

    expect(result.allowed).toBe(false)
    expect(result).toMatchObject({ status: 409, error: ALREADY_IN_ANOTHER_ORG_MESSAGE })
  })

  it('tells the inviter what to do about it', () => {
    // A blocked invite is a dead end unless the message names the way forward,
    // so the inviter does not just retry the same address.
    expect(ALREADY_IN_ANOTHER_ORG_MESSAGE).toMatch(/different email address/i)
    expect(ALREADY_IN_ANOTHER_ORG_MESSAGE).toMatch(/only one organization/i)
  })

  it('distinguishes "already here" from "belongs elsewhere"', () => {
    // Same 409, different meaning — the inviter needs to know which it is.
    const here = checkInviteEligibility([{ organization_id: ORG_A }], ORG_A)
    const elsewhere = checkInviteEligibility([{ organization_id: ORG_B }], ORG_A)

    expect(here).not.toEqual(elsewhere)
  })

  it('rejects an account that is already in several orgs', () => {
    // Data predating the guard. Never treat it as invitable.
    const result = checkInviteEligibility(
      [{ organization_id: ORG_B }, { organization_id: ORG_C }],
      ORG_A
    )

    expect(result.allowed).toBe(false)
  })

  it('reports "already here" when the invitee is in this org and another', () => {
    const result = checkInviteEligibility(
      [{ organization_id: ORG_B }, { organization_id: ORG_A }],
      ORG_A
    )

    expect(result).toMatchObject({ error: ALREADY_IN_THIS_ORG_MESSAGE })
  })

  it('never allows an invite when any membership exists', () => {
    // Property check: the only allowed case is an empty membership list.
    const cases: string[][] = [[], [ORG_A], [ORG_B], [ORG_A, ORG_B], [ORG_B, ORG_C]]

    for (const orgIds of cases) {
      const result = checkInviteEligibility(
        orgIds.map((organization_id) => ({ organization_id })),
        ORG_A
      )
      expect(result.allowed).toBe(orgIds.length === 0)
    }
  })
})

describe('members route wiring', () => {
  const src = readFileSync(
    resolve(__dirname, '../../..', 'src/app/api/settings/members/route.ts'),
    'utf-8'
  )

  /**
   * The membership lookup statement only — from its declaration to the call
   * that consumes it. Anchored on the CALL, found after the declaration, since
   * `checkInviteEligibility` also appears in the import line at the top.
   */
  function membershipLookupSource(): string {
    const start = src.indexOf('const { data: existingMemberships')
    expect(start, 'membership lookup not found in route').toBeGreaterThan(-1)

    const end = src.indexOf('checkInviteEligibility(', start)
    expect(end, 'eligibility call not found after lookup').toBeGreaterThan(start)

    return src.slice(start, end)
  }

  it('uses the shared eligibility check', () => {
    expect(src).toContain('checkInviteEligibility')
  })

  it('extracts a non-empty lookup statement', () => {
    // Guards the two assertions below from passing against an empty slice.
    expect(membershipLookupSource().length).toBeGreaterThan(40)
  })

  it('reads memberships with the admin client, not the caller-scoped one', () => {
    // The SELECT policy is USING (is_org_member(organization_id)), so a
    // caller-scoped read cannot see the invitee's own org and would hand the
    // check an empty list — silently allowing every cross-org invite.
    const lookup = membershipLookupSource()

    expect(lookup).toContain('adminClient')
    expect(lookup).not.toContain('await supabase')
  })

  it('queries all memberships for the user rather than filtering to one org', () => {
    const lookup = membershipLookupSource()

    expect(lookup).toContain("eq('user_id'")
    // Filtering by organization_id here is what caused the original bug.
    expect(lookup).not.toContain("eq('organization_id'")
  })
})

/**
 * Migration 084 — nobody can add themselves to an organization.
 *
 * Migration 001 created "Users can insert their own membership" with
 * WITH CHECK (user_id = auth.uid()). It pins the USER but never the
 * ORGANIZATION, so an account with no membership yet — which is what a fresh
 * signup is — could insert {user_id: self, organization_id: <any>, role:
 * 'owner'} straight from the browser with the anon key and own another tenant.
 *
 * These assertions read the SQL, so they fail if 084 goes missing, if a later
 * migration recreates the policy, or if the staging rebuild script puts it back.
 */

const MIGRATIONS_DIR = resolve(__dirname, '../../..', 'supabase/migrations')
const SELF_INSERT_POLICY = 'Users can insert their own membership'

const MIGRATION_FILES = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()

function readMigration(file: string): string {
  return readFileSync(join(MIGRATIONS_DIR, file), 'utf-8')
}

/** SQL with its comments removed, so prose about a policy cannot satisfy a check. */
function sqlCode(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

describe('membership insert surface (migration 084)', () => {
  it('ships a migration that drops the org-unbound policy', () => {
    const file = MIGRATION_FILES.find((f) => f.startsWith('084_'))
    expect(file, 'migration 084 is missing').toBeTruthy()

    expect(sqlCode(readMigration(file!))).toMatch(
      /DROP\s+POLICY\s+IF\s+EXISTS\s+"Users can insert their own membership"\s+ON\s+organization_members/i
    )
  })

  it('no later migration recreates it', () => {
    const offenders = MIGRATION_FILES.filter((f) => f > '084_').filter((f) =>
      /CREATE\s+POLICY\s+"Users can insert their own membership"/i.test(sqlCode(readMigration(f)))
    )

    expect(offenders).toEqual([])
  })

  it('leaves no membership write policy that fails to name an organization', () => {
    // Shape check, not a name check: any INSERT (or FOR ALL) policy on
    // organization_members with no organization_id in it is the same hole under
    // a different name.
    const offenders: string[] = []

    for (const file of MIGRATION_FILES) {
      for (const statement of sqlCode(readMigration(file)).split(';')) {
        if (!/CREATE\s+POLICY/i.test(statement)) continue
        if (!/ON\s+organization_members\b/i.test(statement)) continue
        if (/\bFOR\s+(SELECT|UPDATE|DELETE)\b/i.test(statement)) continue
        if (/organization_id/i.test(statement)) continue

        offenders.push(`${file}: ${statement.trim().slice(0, 70)}`)
      }
    }

    // 001 is the historical offender and 084 drops it. Nothing else may appear,
    // and the policy 084 drops must be named in the list below.
    expect(offenders.map((o) => o.split('_')[0])).toEqual(['001'])
    expect(offenders[0]).toContain(SELF_INSERT_POLICY)
  })

  it('does not put the policy back when a fresh environment is rebuilt', () => {
    // scripts/staging-replay.sql recreates the whole schema on a new Supabase
    // project. It was generated from 001, so it carried the hole: a staging or
    // disaster-recovery rebuild would have reopened it.
    const replay = sqlCode(
      readFileSync(resolve(__dirname, '../../..', 'scripts/staging-replay.sql'), 'utf-8')
    )

    expect(replay).not.toMatch(/create\s+policy\s+"Users can insert their own membership"/i)
  })

  it('keeps the two paths that actually create memberships', () => {
    // Dropping the policy is only safe because neither real path needs it.
    // 1. Onboarding: create_organization_with_owner() inserts the owner row and
    //    is SECURITY DEFINER, so it is not subject to the policy.
    const rpc = MIGRATION_FILES.filter((f) =>
      /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+create_organization_with_owner/i.test(
        sqlCode(readMigration(f))
      )
    ).pop()

    expect(rpc, 'no migration defines create_organization_with_owner').toBeTruthy()
    expect(sqlCode(readMigration(rpc!))).toMatch(/SECURITY\s+DEFINER/i)

    // 2. Adding a team member: the members route inserts with the service-role
    //    client (which bypasses RLS) into the CALLER's own org, after checking
    //    that the caller is the owner.
    const route = readFileSync(
      resolve(__dirname, '../../..', 'src/app/api/settings/members/route.ts'),
      'utf-8'
    )
    const insertMatch = route.match(
      /[\s\S]{0,80}\.from\('organization_members'\)\s*\.insert\([\s\S]{0,220}/
    )
    expect(insertMatch, 'membership insert not found in the members route').toBeTruthy()

    const insertStatement = insertMatch![0]
    expect(insertStatement).toContain('adminClient')
    expect(insertStatement).toContain('organization_id: membership.organization_id')
  })
})
