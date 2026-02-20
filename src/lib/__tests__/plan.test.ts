import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  resolveOrgPlan,
  canAddMusician,
  canCreateProject,
  canAddMember,
  canUseEmailFeatures,
  canBulkImport,
  canUseSavedEnsembles,
  PLAN_LIMITS,
  type OrgBilling,
  type ResolvedPlan,
} from '../plan'

// Helper to create org billing data with sensible defaults
function makeOrg(overrides: Partial<OrgBilling> = {}): OrgBilling {
  return {
    plan_tier: 'free',
    trial_ends_at: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: null,
    ...overrides,
  }
}

// Helper for dates
function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

// ─────────────────────────────────────────────────
// resolveOrgPlan
// ─────────────────────────────────────────────────
describe('resolveOrgPlan', () => {
  describe('active Stripe subscription', () => {
    it('returns pro when subscription_status is active', () => {
      const plan = resolveOrgPlan(makeOrg({
        plan_tier: 'pro',
        subscription_status: 'active',
        stripe_subscription_id: 'sub_123',
      }))
      expect(plan.tier).toBe('pro')
      expect(plan.status).toBe('pro')
      expect(plan.canUpgrade).toBe(false)
      expect(plan.trialDaysRemaining).toBeNull()
    })

    it('returns pro when subscription_status is trialing (Stripe trial)', () => {
      const plan = resolveOrgPlan(makeOrg({
        plan_tier: 'pro',
        subscription_status: 'trialing',
      }))
      expect(plan.tier).toBe('pro')
      expect(plan.status).toBe('pro')
      expect(plan.canUpgrade).toBe(false)
    })

    it('active subscription overrides expired trial', () => {
      const plan = resolveOrgPlan(makeOrg({
        plan_tier: 'trial',
        trial_ends_at: daysFromNow(-5), // expired
        subscription_status: 'active',
      }))
      expect(plan.tier).toBe('pro')
      expect(plan.status).toBe('pro')
    })
  })

  describe('past_due subscription (grace period)', () => {
    it('returns pro with past_due status', () => {
      const plan = resolveOrgPlan(makeOrg({
        plan_tier: 'pro',
        subscription_status: 'past_due',
      }))
      expect(plan.tier).toBe('pro')
      expect(plan.status).toBe('past_due')
      expect(plan.canUpgrade).toBe(false)
    })
  })

  describe('trial tier defaults to pro (billing not launched)', () => {
    it('returns pro for trial tier with future trial_ends_at', () => {
      const plan = resolveOrgPlan(makeOrg({
        plan_tier: 'trial',
        trial_ends_at: daysFromNow(10),
      }))
      expect(plan.tier).toBe('pro')
      expect(plan.status).toBe('pro')
      expect(plan.canUpgrade).toBe(false)
      expect(plan.trialDaysRemaining).toBeNull()
    })

    it('defaults to pro when trial expired (billing not launched)', () => {
      const plan = resolveOrgPlan(makeOrg({
        plan_tier: 'trial',
        trial_ends_at: daysFromNow(-1),
      }))
      expect(plan.tier).toBe('pro')
      expect(plan.status).toBe('pro')
      expect(plan.canUpgrade).toBe(false)
      expect(plan.trialDaysRemaining).toBeNull()
    })

    it('defaults to pro when trial_ends_at is exactly now (0 remaining)', () => {
      // Edge: trial_ends_at in the past by milliseconds
      const justExpired = new Date(Date.now() - 1000).toISOString()
      const plan = resolveOrgPlan(makeOrg({
        plan_tier: 'trial',
        trial_ends_at: justExpired,
      }))
      expect(plan.tier).toBe('pro')
    })
  })

  describe('explicit free tier', () => {
    it('returns free when plan_tier is explicitly free', () => {
      const plan = resolveOrgPlan(makeOrg({ plan_tier: 'free' }))
      expect(plan.tier).toBe('free')
      expect(plan.status).toBe('free')
      expect(plan.canUpgrade).toBe(true)
      expect(plan.trialDaysRemaining).toBeNull()
    })

    it('returns free when subscription is canceled and plan set to free', () => {
      const plan = resolveOrgPlan(makeOrg({
        plan_tier: 'free',
        subscription_status: 'canceled',
        stripe_subscription_id: 'sub_old',
      }))
      expect(plan.tier).toBe('free')
      expect(plan.status).toBe('free')
      expect(plan.canUpgrade).toBe(true)
    })
  })

  describe('default to pro (billing not launched)', () => {
    it('returns pro for incomplete subscription without explicit free', () => {
      const plan = resolveOrgPlan(makeOrg({
        plan_tier: 'trial',
        subscription_status: 'incomplete',
      }))
      expect(plan.tier).toBe('pro')
    })

    it('returns pro for unpaid subscription without explicit free', () => {
      const plan = resolveOrgPlan(makeOrg({
        plan_tier: 'trial',
        subscription_status: 'unpaid',
      }))
      expect(plan.tier).toBe('pro')
    })

    it('returns pro when trial tier set but no trial_ends_at', () => {
      const plan = resolveOrgPlan(makeOrg({
        plan_tier: 'trial',
        trial_ends_at: null,
      }))
      expect(plan.tier).toBe('pro')
    })
  })

  describe('resolution priority', () => {
    it('active subscription wins over everything', () => {
      const plan = resolveOrgPlan(makeOrg({
        plan_tier: 'trial',
        trial_ends_at: daysFromNow(14),
        subscription_status: 'active',
        stripe_subscription_id: 'sub_123',
      }))
      expect(plan.status).toBe('pro') // not 'trial'
    })

    it('past_due wins over active trial', () => {
      const plan = resolveOrgPlan(makeOrg({
        plan_tier: 'trial',
        trial_ends_at: daysFromNow(14),
        subscription_status: 'past_due',
      }))
      expect(plan.status).toBe('past_due')
    })
  })
})

// ─────────────────────────────────────────────────
// Feature gate helpers
// ─────────────────────────────────────────────────
describe('feature gate helpers', () => {
  const proPlan: ResolvedPlan = { tier: 'pro', status: 'pro', trialDaysRemaining: null, canUpgrade: false }
  const freePlan: ResolvedPlan = { tier: 'free', status: 'free', trialDaysRemaining: null, canUpgrade: true }
  const trialPlan: ResolvedPlan = { tier: 'pro', status: 'trial', trialDaysRemaining: 10, canUpgrade: true }

  describe('canAddMusician', () => {
    it('always true on pro', () => {
      expect(canAddMusician(proPlan, 0)).toBe(true)
      expect(canAddMusician(proPlan, 100)).toBe(true)
      expect(canAddMusician(proPlan, 10000)).toBe(true)
    })

    it('always true on trial (pro access)', () => {
      expect(canAddMusician(trialPlan, 50)).toBe(true)
    })

    it('true on free when under limit', () => {
      expect(canAddMusician(freePlan, 0)).toBe(true)
      expect(canAddMusician(freePlan, 24)).toBe(true)
    })

    it('false on free at limit', () => {
      expect(canAddMusician(freePlan, 25)).toBe(false)
    })

    it('false on free over limit', () => {
      expect(canAddMusician(freePlan, 30)).toBe(false)
    })
  })

  describe('canCreateProject', () => {
    it('always true on pro', () => {
      expect(canCreateProject(proPlan, 0)).toBe(true)
      expect(canCreateProject(proPlan, 100)).toBe(true)
    })

    it('true on free when under limit', () => {
      expect(canCreateProject(freePlan, 0)).toBe(true)
      expect(canCreateProject(freePlan, 2)).toBe(true)
    })

    it('false on free at limit', () => {
      expect(canCreateProject(freePlan, 3)).toBe(false)
    })

    it('false on free over limit', () => {
      expect(canCreateProject(freePlan, 5)).toBe(false)
    })
  })

  describe('canAddMember', () => {
    it('always true on pro', () => {
      expect(canAddMember(proPlan, 5)).toBe(true)
    })

    it('true on free when under limit (0 non-owner admins)', () => {
      expect(canAddMember(freePlan, 0)).toBe(true)
    })

    it('false on free at limit (1 = owner only)', () => {
      expect(canAddMember(freePlan, 1)).toBe(false)
    })
  })

  describe('pro-only features', () => {
    it('canUseEmailFeatures', () => {
      expect(canUseEmailFeatures(proPlan)).toBe(true)
      expect(canUseEmailFeatures(trialPlan)).toBe(true)
      expect(canUseEmailFeatures(freePlan)).toBe(false)
    })

    it('canBulkImport', () => {
      expect(canBulkImport(proPlan)).toBe(true)
      expect(canBulkImport(trialPlan)).toBe(true)
      expect(canBulkImport(freePlan)).toBe(false)
    })

    it('canUseSavedEnsembles', () => {
      expect(canUseSavedEnsembles(proPlan)).toBe(true)
      expect(canUseSavedEnsembles(trialPlan)).toBe(true)
      expect(canUseSavedEnsembles(freePlan)).toBe(false)
    })
  })
})

// ─────────────────────────────────────────────────
// PLAN_LIMITS constant
// ─────────────────────────────────────────────────
describe('PLAN_LIMITS', () => {
  it('free limits are correct', () => {
    expect(PLAN_LIMITS.free.musicians).toBe(25)
    expect(PLAN_LIMITS.free.activeProjects).toBe(3)
    expect(PLAN_LIMITS.free.adminSeats).toBe(1)
  })

  it('pro limits are unlimited', () => {
    expect(PLAN_LIMITS.pro.musicians).toBe(Infinity)
    expect(PLAN_LIMITS.pro.activeProjects).toBe(Infinity)
    expect(PLAN_LIMITS.pro.adminSeats).toBe(Infinity)
  })
})
