-- 066: Billing tiers (V2.0 — Free / Ensemble / Orchestra / Symphony)
--
-- Moves from the binary free/pro model to four tiers and adds an explicit
-- is_comped flag so the founding orgs keep full access forever, even once
-- billing enforcement is turned on.
--
-- Safe to apply anytime: while NEXT_PUBLIC_BILLING_ENABLED is off, plan
-- resolution ignores these columns and grants everyone top-tier access. Apply
-- BEFORE deploying the tier code, and before flipping enforcement on.

-- 1. Comped flag (founding orgs). Additive, defaulted.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS is_comped BOOLEAN NOT NULL DEFAULT false;

-- 2. The current comped orgs are the ones carrying plan_tier='pro' with no
--    Stripe subscription. Mark them comped, then migrate the value off 'pro'
--    (the new tier set has no 'pro'; is_comped is what grants their access).
UPDATE organizations SET is_comped = true
  WHERE plan_tier = 'pro' AND stripe_subscription_id IS NULL;

UPDATE organizations SET plan_tier = 'free'
  WHERE plan_tier = 'pro';

-- 3. Replace the tier CHECK constraint with the four-tier set (keep 'trial'
--    since that's the column default for brand-new orgs).
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_plan_tier_check;
ALTER TABLE organizations ADD CONSTRAINT organizations_plan_tier_check
  CHECK (plan_tier IN ('trial', 'free', 'ensemble', 'orchestra', 'symphony'));

-- verify: no org should still be on 'pro'; comped count should equal the
-- number of founding orgs.
-- SELECT plan_tier, is_comped, count(*) FROM organizations GROUP BY 1, 2 ORDER BY 1;
-- Expected: no 'pro' rows; the founding orgs show is_comped = true.

-- verify: constraint present
-- SELECT conname FROM pg_constraint WHERE conname = 'organizations_plan_tier_check';
