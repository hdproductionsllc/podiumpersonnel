import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
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
