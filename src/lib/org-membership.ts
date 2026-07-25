/**
 * One account belongs to exactly one organization.
 *
 * That rule is the product's intent, and the code depends on it: roughly 38 of
 * the API routes resolve the caller's org with
 *
 *   .from('organization_members').select(...).eq('user_id', user.id).single()
 *
 * PostgREST's .single() returns no row when the query matches TWO, so an account
 * holding two memberships gets "No organization found" from all of them. The
 * dashboard shell was hardened separately to pick the first membership, which
 * makes the failure quieter rather than louder: the invitee's dashboard loads
 * and looks healthy while every action inside it errors.
 *
 * The org-creation path already enforces this (the /onboarding page redirects an
 * account that already has a membership). This module covers the other path —
 * inviting an existing account to a second org — and keeps the decision in a
 * pure function so it can be tested without a database.
 */

export type ExistingMembership = {
  organization_id: string
}

export type InviteCheck =
  | { allowed: true }
  | { allowed: false; status: number; error: string }

/** Message shown when the invitee already belongs to a different organization. */
export const ALREADY_IN_ANOTHER_ORG_MESSAGE =
  'That account already belongs to another organization. Each account can belong to only one organization — ' +
  'ask them to sign up with a different email address, then invite that one.'

/** Message shown when the invitee is already in the inviting organization. */
export const ALREADY_IN_THIS_ORG_MESSAGE = 'User is already a member of this organization'

/**
 * Decide whether an account may be added to `organizationId`.
 *
 * `existingMemberships` must be EVERY membership the target account holds, read
 * with the service-role client. The SELECT policy on organization_members is
 * `USING (is_org_member(organization_id))`, so a caller-scoped read only returns
 * rows for orgs the CALLER belongs to — the invitee's own org would be invisible
 * and this function would be handed an empty list, wrongly allowing the invite.
 */
export function checkInviteEligibility(
  existingMemberships: ExistingMembership[],
  organizationId: string
): InviteCheck {
  if (existingMemberships.some((m) => m.organization_id === organizationId)) {
    return { allowed: false, status: 409, error: ALREADY_IN_THIS_ORG_MESSAGE }
  }

  if (existingMemberships.length > 0) {
    return { allowed: false, status: 409, error: ALREADY_IN_ANOTHER_ORG_MESSAGE }
  }

  return { allowed: true }
}
