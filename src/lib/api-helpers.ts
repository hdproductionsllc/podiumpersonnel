import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrgPlan, type ResolvedPlan, type OrgBilling } from '@/lib/plan'

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(data, { status })
}

export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
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
  const { data: org } = await adminClient
    .from('organizations')
    .select('plan_tier, trial_ends_at, stripe_customer_id, stripe_subscription_id, subscription_status')
    .eq('id', organizationId)
    .single()

  if (!org) return null
  return resolveOrgPlan(org as OrgBilling)
}
