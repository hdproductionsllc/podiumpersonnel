import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  resolveOrgPlan,
  canAddMusician,
  canCreateProject,
  canAddMember,
  canUseEmailFeatures,
  canBulkImport,
  canUseSavedEnsembles,
  canUseSubstitutions,
  canExport,
  priceIdToTier,
  tierToPriceId,
  PLAN_LIMITS,
  TIER_RANK,
  type OrgBilling,
  type ResolvedPlan,
  type PlanTier,
} from '../plan'

function makeOrg(overrides: Partial<OrgBilling> = {}): OrgBilling {
  return {
    plan_tier: 'free',
    trial_ends_at: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: null,
    is_comped: false,
    ...overrides,
  }
}

function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

function plan(tier: PlanTier): ResolvedPlan {
  return { tier, status: 'active', trialDaysRemaining: null, canUpgrade: false }
}

const ORIG_ENV = { ...process.env }
beforeEach(() => {
  process.env.STRIPE_ENSEMBLE_PRICE_ID = 'price_ens'
  process.env.STRIPE_ORCHESTRA_PRICE_ID = 'price_orch'
  process.env.STRIPE_SYMPHONY_PRICE_ID = 'price_symph'
})
afterEach(() => {
  process.env = { ...ORIG_ENV }
})

describe('resolveOrgPlan — billing OFF (pre-launch)', () => {
  beforeEach(() => { delete process.env.NEXT_PUBLIC_BILLING_ENABLED })

  it('grants top-tier (symphony) access to everyone', () => {
    const p = resolveOrgPlan(makeOrg({ plan_tier: 'free' }))
    expect(p.tier).toBe('symphony')
    expect(p.canUpgrade).toBe(false)
  })
})

describe('resolveOrgPlan — comped orgs', () => {
  it('are symphony/comped even when billing is enforced', () => {
    process.env.NEXT_PUBLIC_BILLING_ENABLED = 'true'
    const p = resolveOrgPlan(makeOrg({ is_comped: true, plan_tier: 'free' }))
    expect(p.tier).toBe('symphony')
    expect(p.status).toBe('comped')
    expect(p.canUpgrade).toBe(false)
  })

  it('stay comped regardless of subscription state', () => {
    process.env.NEXT_PUBLIC_BILLING_ENABLED = 'true'
    const p = resolveOrgPlan(makeOrg({ is_comped: true, subscription_status: 'canceled' }))
    expect(p.tier).toBe('symphony')
  })
})

describe('resolveOrgPlan — billing ON', () => {
  beforeEach(() => { process.env.NEXT_PUBLIC_BILLING_ENABLED = 'true' })

  it('active subscription resolves to the subscribed tier', () => {
    for (const tier of ['ensemble', 'orchestra', 'symphony'] as const) {
      const p = resolveOrgPlan(makeOrg({ plan_tier: tier, subscription_status: 'active' }))
      expect(p.tier).toBe(tier)
      expect(p.status).toBe('active')
    }
  })

  it('canUpgrade is false only at the top tier', () => {
    expect(resolveOrgPlan(makeOrg({ plan_tier: 'ensemble', subscription_status: 'active' })).canUpgrade).toBe(true)
    expect(resolveOrgPlan(makeOrg({ plan_tier: 'symphony', subscription_status: 'active' })).canUpgrade).toBe(false)
  })

  it('past_due keeps the paid tier (grace period)', () => {
    const p = resolveOrgPlan(makeOrg({ plan_tier: 'orchestra', subscription_status: 'past_due' }))
    expect(p.tier).toBe('orchestra')
    expect(p.status).toBe('past_due')
  })

  it('an unmatched paid plan_tier falls back to ensemble (never crashes)', () => {
    const p = resolveOrgPlan(makeOrg({ plan_tier: 'garbage', subscription_status: 'active' }))
    expect(p.tier).toBe('ensemble')
  })

  it('active trial grants symphony access with days remaining', () => {
    const p = resolveOrgPlan(makeOrg({ trial_ends_at: daysFromNow(10) }))
    expect(p.tier).toBe('symphony')
    expect(p.status).toBe('trial')
    expect(p.trialDaysRemaining).toBeGreaterThan(0)
  })

  it('expired trial drops to free', () => {
    const p = resolveOrgPlan(makeOrg({ trial_ends_at: daysFromNow(-1) }))
    expect(p.tier).toBe('free')
    expect(p.status).toBe('free')
  })

  it('no subscription and no trial → free', () => {
    const p = resolveOrgPlan(makeOrg({ subscription_status: 'canceled' }))
    expect(p.tier).toBe('free')
  })
})

describe('price ↔ tier mapping', () => {
  it('maps price ids to tiers', () => {
    expect(priceIdToTier('price_ens')).toBe('ensemble')
    expect(priceIdToTier('price_orch')).toBe('orchestra')
    expect(priceIdToTier('price_symph')).toBe('symphony')
    expect(priceIdToTier('price_unknown')).toBeNull()
    expect(priceIdToTier(null)).toBeNull()
  })
  it('maps tiers back to price ids', () => {
    expect(tierToPriceId('ensemble')).toBe('price_ens')
    expect(tierToPriceId('orchestra')).toBe('price_orch')
    expect(tierToPriceId('symphony')).toBe('price_symph')
  })
})

describe('count-based gates respect per-tier limits', () => {
  it('musician limits', () => {
    expect(canAddMusician(plan('free'), 24)).toBe(true)
    expect(canAddMusician(plan('free'), 25)).toBe(false)
    expect(canAddMusician(plan('ensemble'), 59)).toBe(true)
    expect(canAddMusician(plan('ensemble'), 60)).toBe(false)
    expect(canAddMusician(plan('orchestra'), 249)).toBe(true)
    expect(canAddMusician(plan('orchestra'), 250)).toBe(false)
    expect(canAddMusician(plan('symphony'), 100000)).toBe(true)
  })
  it('project limits (free capped, paid unlimited)', () => {
    expect(canCreateProject(plan('free'), 3)).toBe(false)
    expect(canCreateProject(plan('ensemble'), 999)).toBe(true)
  })
  it('admin seat limits', () => {
    expect(canAddMember(plan('free'), 1)).toBe(false)
    expect(canAddMember(plan('ensemble'), 1)).toBe(false)
    expect(canAddMember(plan('orchestra'), 2)).toBe(true)
    expect(canAddMember(plan('orchestra'), 3)).toBe(false)
    expect(canAddMember(plan('symphony'), 50)).toBe(true)
  })
})

describe('feature gates by minimum tier', () => {
  it('ensemble-and-up features', () => {
    for (const fn of [canUseEmailFeatures, canBulkImport, canUseSavedEnsembles]) {
      expect(fn(plan('free'))).toBe(false)
      expect(fn(plan('ensemble'))).toBe(true)
      expect(fn(plan('orchestra'))).toBe(true)
      expect(fn(plan('symphony'))).toBe(true)
    }
  })
  it('orchestra-and-up features', () => {
    for (const fn of [canUseSubstitutions, canExport]) {
      expect(fn(plan('free'))).toBe(false)
      expect(fn(plan('ensemble'))).toBe(false)
      expect(fn(plan('orchestra'))).toBe(true)
      expect(fn(plan('symphony'))).toBe(true)
    }
  })
})

describe('tier structure invariants', () => {
  it('ranks are strictly increasing free < ensemble < orchestra < symphony', () => {
    expect(TIER_RANK.free).toBeLessThan(TIER_RANK.ensemble)
    expect(TIER_RANK.ensemble).toBeLessThan(TIER_RANK.orchestra)
    expect(TIER_RANK.orchestra).toBeLessThan(TIER_RANK.symphony)
  })
  it('limits are non-decreasing up the tiers', () => {
    const tiers: PlanTier[] = ['free', 'ensemble', 'orchestra', 'symphony']
    for (let i = 1; i < tiers.length; i++) {
      expect(PLAN_LIMITS[tiers[i]].musicians).toBeGreaterThanOrEqual(PLAN_LIMITS[tiers[i - 1]].musicians)
      expect(PLAN_LIMITS[tiers[i]].adminSeats).toBeGreaterThanOrEqual(PLAN_LIMITS[tiers[i - 1]].adminSeats)
    }
  })
})
