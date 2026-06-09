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
 * Master switch for whether billing is enforced. While this is off (the default
 * until launch) every org gets full Pro access regardless of subscription state.
 * Set NEXT_PUBLIC_BILLING_ENABLED=true to turn on real plan resolution + gating.
 * NEXT_PUBLIC_ so the same answer is computed on both server and client.
 */
export function isBillingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true'
}

/**
 * Resolve the effective plan from org billing columns.
 *
 * When billing is NOT enabled → Pro for everyone (pre-launch).
 * When enabled, resolution order:
 * 1. subscription_status 'active' / 'trialing' → Pro
 * 2. subscription_status 'past_due' → Pro (grace period while Stripe retries)
 * 3. trial_ends_at in the future → Pro (trial), with days remaining
 * 4. Everything else (trial expired or canceled) → Free
 */
export function resolveOrgPlan(org: OrgBilling): ResolvedPlan {
  // Pre-launch: billing not enforced, everyone gets full access.
  if (!isBillingEnabled()) {
    return { tier: 'pro', status: 'pro', trialDaysRemaining: null, canUpgrade: false }
  }

  const subStatus = org.subscription_status

  // Active Stripe subscription
  if (subStatus === 'active' || subStatus === 'trialing') {
    return { tier: 'pro', status: 'pro', trialDaysRemaining: null, canUpgrade: false }
  }

  // Past due — grace period, Stripe is retrying payment
  if (subStatus === 'past_due') {
    return { tier: 'pro', status: 'past_due', trialDaysRemaining: null, canUpgrade: false }
  }

  // No active subscription — honor the free trial window if it hasn't elapsed.
  if (org.trial_ends_at) {
    const msRemaining = new Date(org.trial_ends_at).getTime() - Date.now()
    if (msRemaining > 0) {
      const trialDaysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24))
      return { tier: 'pro', status: 'trial', trialDaysRemaining, canUpgrade: true }
    }
  }

  // Trial expired or explicitly downgraded to free.
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
