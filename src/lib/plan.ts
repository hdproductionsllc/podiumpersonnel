// Single source of truth for plan resolution and feature gating

export type PlanTier = 'trial' | 'free' | 'pro'
export type PlanStatus = 'trial' | 'free' | 'pro' | 'past_due'

export type OrgBilling = {
  plan_tier: PlanTier
  trial_ends_at: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  subscription_status: string | null
}

export type ResolvedPlan = {
  tier: 'free' | 'pro'
  status: PlanStatus
  trialDaysRemaining: number | null
  canUpgrade: boolean
}

export const PLAN_LIMITS = {
  free: {
    musicians: 25,
    activeProjects: 3,
    adminSeats: 1, // owner only
  },
  pro: {
    musicians: Infinity,
    activeProjects: Infinity,
    adminSeats: Infinity,
  },
} as const

/**
 * Resolve the effective plan from org billing columns.
 *
 * Resolution order:
 * 1. subscription_status is 'active' or 'trialing' → Pro
 * 2. subscription_status is 'past_due' → Pro (grace period)
 * 3. plan_tier is 'trial' and trial_ends_at in future → Pro (trial)
 * 4. Everything else → Free
 */
export function resolveOrgPlan(org: OrgBilling): ResolvedPlan {
  const subStatus = org.subscription_status

  // Active Stripe subscription
  if (subStatus === 'active' || subStatus === 'trialing') {
    return { tier: 'pro', status: 'pro', trialDaysRemaining: null, canUpgrade: false }
  }

  // Past due — grace period, Stripe is retrying payment
  if (subStatus === 'past_due') {
    return { tier: 'pro', status: 'past_due', trialDaysRemaining: null, canUpgrade: false }
  }

  // In-app trial (no Stripe subscription yet)
  if (org.plan_tier === 'trial' && org.trial_ends_at) {
    const remaining = Math.ceil(
      (new Date(org.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    )
    if (remaining > 0) {
      return { tier: 'pro', status: 'trial', trialDaysRemaining: remaining, canUpgrade: true }
    }
  }

  // Everything else → Free
  return { tier: 'free', status: 'free', trialDaysRemaining: null, canUpgrade: true }
}

// --- Feature gate helpers ---

export function canAddMusician(plan: ResolvedPlan, currentCount: number): boolean {
  if (plan.tier === 'pro') return true
  return currentCount < PLAN_LIMITS.free.musicians
}

export function canCreateProject(plan: ResolvedPlan, activeCount: number): boolean {
  if (plan.tier === 'pro') return true
  return activeCount < PLAN_LIMITS.free.activeProjects
}

export function canAddMember(plan: ResolvedPlan, currentCount: number): boolean {
  if (plan.tier === 'pro') return true
  return currentCount < PLAN_LIMITS.free.adminSeats
}

export function canUseEmailFeatures(plan: ResolvedPlan): boolean {
  return plan.tier === 'pro'
}

export function canBulkImport(plan: ResolvedPlan): boolean {
  return plan.tier === 'pro'
}

export function canUseSavedEnsembles(plan: ResolvedPlan): boolean {
  return plan.tier === 'pro'
}
