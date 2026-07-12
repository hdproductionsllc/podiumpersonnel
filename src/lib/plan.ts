// Single source of truth for plan resolution and feature gating.
//
// Four tiers (plus a transient trial). "Comped" orgs (the founding orgs) always
// get top-tier access even when billing is enforced — protected by is_comped so
// turning enforcement on never touches them.

export type PaidTier = 'ensemble' | 'orchestra' | 'symphony'
export type PlanTier = 'free' | PaidTier
export type PlanStatus = 'free' | 'trial' | 'active' | 'past_due' | 'comped'

/** Ordering for "at least tier X" feature gates. */
export const TIER_RANK: Record<PlanTier, number> = {
  free: 0,
  ensemble: 1,
  orchestra: 2,
  symphony: 3,
}

export type OrgBilling = {
  plan_tier: string | null
  trial_ends_at: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  subscription_status: string | null
  is_comped: boolean | null
}

export type ResolvedPlan = {
  tier: PlanTier
  status: PlanStatus
  trialDaysRemaining: number | null
  canUpgrade: boolean
}

export const PLAN_LIMITS: Record<PlanTier, { musicians: number; activeProjects: number; adminSeats: number }> = {
  free: { musicians: 25, activeProjects: 3, adminSeats: 1 },
  ensemble: { musicians: 60, activeProjects: Infinity, adminSeats: 1 },
  orchestra: { musicians: 250, activeProjects: Infinity, adminSeats: 3 },
  symphony: { musicians: Infinity, activeProjects: Infinity, adminSeats: Infinity },
}

/**
 * Master switch for whether billing is enforced. While off (the default) every
 * org gets full top-tier access regardless of subscription. Set
 * NEXT_PUBLIC_BILLING_ENABLED=true to turn on real resolution + gating.
 * NEXT_PUBLIC_ so server and client compute the same answer.
 */
export function isBillingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true'
}

function asPaidTier(t: string | null | undefined): PaidTier | null {
  return t === 'ensemble' || t === 'orchestra' || t === 'symphony' ? t : null
}

/** Map a Stripe price id to its tier (reads the tier price env vars). */
export function priceIdToTier(priceId: string | null | undefined): PaidTier | null {
  if (!priceId) return null
  if (priceId === process.env.STRIPE_ENSEMBLE_PRICE_ID) return 'ensemble'
  if (priceId === process.env.STRIPE_ORCHESTRA_PRICE_ID) return 'orchestra'
  if (priceId === process.env.STRIPE_SYMPHONY_PRICE_ID) return 'symphony'
  return null
}

/** Map a tier to its Stripe price id (undefined if the env var isn't set). */
export function tierToPriceId(tier: PaidTier): string | undefined {
  const map: Record<PaidTier, string | undefined> = {
    ensemble: process.env.STRIPE_ENSEMBLE_PRICE_ID,
    orchestra: process.env.STRIPE_ORCHESTRA_PRICE_ID,
    symphony: process.env.STRIPE_SYMPHONY_PRICE_ID,
  }
  return map[tier]
}

/**
 * Resolve the effective plan from an org's billing columns.
 *
 * Resolution order:
 * 1. Comped orgs → Symphony forever (survives enforcement; founding orgs).
 * 2. Billing not enforced (pre-launch) → Symphony for everyone.
 * 3. Active / trialing / past_due subscription → the subscribed paid tier
 *    (plan_tier, kept in sync by the webhook). past_due keeps access (grace).
 * 4. Trial window not elapsed → full (Symphony) trial access, with days left.
 * 5. Otherwise → Free.
 */
export function resolveOrgPlan(org: OrgBilling): ResolvedPlan {
  if (org.is_comped) {
    return { tier: 'symphony', status: 'comped', trialDaysRemaining: null, canUpgrade: false }
  }

  if (!isBillingEnabled()) {
    return { tier: 'symphony', status: 'active', trialDaysRemaining: null, canUpgrade: false }
  }

  const subStatus = org.subscription_status
  if (subStatus === 'active' || subStatus === 'trialing' || subStatus === 'past_due') {
    const tier = asPaidTier(org.plan_tier) ?? 'ensemble'
    const status: PlanStatus = subStatus === 'past_due' ? 'past_due' : 'active'
    return { tier, status, trialDaysRemaining: null, canUpgrade: tier !== 'symphony' }
  }

  if (org.trial_ends_at) {
    const msRemaining = new Date(org.trial_ends_at).getTime() - Date.now()
    if (msRemaining > 0) {
      const trialDaysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24))
      return { tier: 'symphony', status: 'trial', trialDaysRemaining, canUpgrade: true }
    }
  }

  return { tier: 'free', status: 'free', trialDaysRemaining: null, canUpgrade: true }
}

// --- Feature gate helpers (stable interface for all consumers) ---

function atLeast(plan: ResolvedPlan, tier: PlanTier): boolean {
  return TIER_RANK[plan.tier] >= TIER_RANK[tier]
}

export function canAddMusician(plan: ResolvedPlan, currentCount: number): boolean {
  return currentCount < PLAN_LIMITS[plan.tier].musicians
}

export function canCreateProject(plan: ResolvedPlan, activeCount: number): boolean {
  return activeCount < PLAN_LIMITS[plan.tier].activeProjects
}

export function canAddMember(plan: ResolvedPlan, currentCount: number): boolean {
  return currentCount < PLAN_LIMITS[plan.tier].adminSeats
}

// Ensemble and up
export function canUseEmailFeatures(plan: ResolvedPlan): boolean {
  return atLeast(plan, 'ensemble')
}
export function canBulkImport(plan: ResolvedPlan): boolean {
  return atLeast(plan, 'ensemble')
}
export function canUseSavedEnsembles(plan: ResolvedPlan): boolean {
  return atLeast(plan, 'ensemble')
}

// Orchestra and up
export function canUseSubstitutions(plan: ResolvedPlan): boolean {
  return atLeast(plan, 'orchestra')
}
export function canExport(plan: ResolvedPlan): boolean {
  return atLeast(plan, 'orchestra')
}
