import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrgPlan, isBillingEnabled, type ResolvedPlan, type OrgBilling } from '@/lib/plan'
import { resolveVertical, type VerticalTemplate } from '@/lib/verticals'

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(data, { status })
}

export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

/**
 * Standard 500 response. Logs the real error server-side (with context) and
 * returns a generic, non-leaky message — raw Postgres/RLS text should never
 * reach a user-facing toast.
 */
export function serverError(context: string, error: unknown, status = 500) {
  console.error(`${context}:`, error)
  return NextResponse.json(
    { error: 'Something went wrong on our end. Please try again, or contact support if it continues.' },
    { status }
  )
}

export async function requireAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { supabase, user: null, error: apiError('Unauthorized', 401) }
  }

  return { supabase, user, error: null }
}

export async function requireOrgAdmin() {
  const { supabase, user, error } = await requireAuth()
  if (error || !user) {
    return { supabase, user: null, membership: null, error: error! }
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return { supabase, user, membership: null, error: apiError('No organization found', 404) }
  }

  if (!['owner', 'admin'].includes(membership.role)) {
    return { supabase, user, membership: null, error: apiError('Permission denied', 403) }
  }

  return { supabase, user, membership, error: null }
}

export async function requireOrgPlan() {
  const { supabase, user, membership, error } = await requireOrgAdmin()
  if (error || !user || !membership) {
    return { supabase, user: null, membership: null, plan: null, error: error! }
  }

  const adminClient = createAdminClient()
  const { data: org } = await adminClient
    .from('organizations')
    .select('plan_tier, trial_ends_at, stripe_customer_id, stripe_subscription_id, subscription_status')
    .eq('id', membership.organization_id)
    .single()

  if (!org) {
    return { supabase, user, membership, plan: null, error: apiError('Organization not found', 404) }
  }

  const plan = resolveOrgPlan(org as OrgBilling)
  return { supabase, user, membership, plan, error: null }
}

/**
 * Lightweight plan check for routes that do their own auth.
 * Pass the user's org ID. Returns resolved plan or null on error.
 */
export async function getOrgPlan(organizationId: string): Promise<ResolvedPlan | null> {
  const adminClient = createAdminClient()
  const { data: org, error } = await adminClient
    .from('organizations')
    .select('plan_tier, trial_ends_at, stripe_customer_id, stripe_subscription_id, subscription_status')
    .eq('id', organizationId)
    .single()

  if (error || !org) {
    // Fail closed when billing is enforced: deny premium features rather than
    // leak them on a lookup error. Pre-launch (billing off) nothing is gated,
    // so return null and let callers no-op.
    if (isBillingEnabled()) {
      console.error(`getOrgPlan failed for ${organizationId}; failing closed to free:`, error)
      return { tier: 'free', status: 'free', trialDaysRemaining: null, canUpgrade: true }
    }
    return null
  }
  return resolveOrgPlan(org as OrgBilling)
}

/**
 * Resolve an org's vertical template for server code (API routes, emails).
 * Unlike getOrgPlan this always fails OPEN to the default template: a wrong
 * label is cosmetic, but throwing inside an email path would break real sends.
 */
export async function getOrgVertical(organizationId: string): Promise<VerticalTemplate> {
  try {
    const adminClient = createAdminClient()
    const { data: org } = await adminClient
      .from('organizations')
      .select('vertical')
      .eq('id', organizationId)
      .single()
    return resolveVertical(org?.vertical)
  } catch {
    // Column not migrated yet, or lookup failed — default template
    return resolveVertical(null)
  }
}
