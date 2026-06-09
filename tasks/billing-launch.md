# Billing Launch Runbook (run when ready to charge — ~30 min)

All billing code is already deployed and dormant. Turning it on is configuration only.
Until then: every org gets full Pro access; nothing is gated; nobody can pay.

## Pre-conditions (already done at product launch, 2026-06-09)
- [x] Billing code on master: checkout/portal/webhook routes, plan gating, trial logic
- [x] Webhook idempotency (`stripe_events` table, migration 064)
- [x] All 6 founding orgs comped: `plan_tier='pro'` with no subscription = Pro forever
  (resolveOrgPlan checks this AFTER past_due so real subscribers still get grace-period status)
- [x] Marketing pricing page live: Free / $29 Pro, 14-day trial, no credit card to start

## Step 1 — Stripe account (one-time)
1. Create/activate Stripe account in **live mode** (business verification can take 1–2 days — start early).
2. Create Product "Podium Pro" → recurring price **$29/month USD**. Copy the `price_...` id.

## Step 2 — Webhook
1. Stripe Dashboard → Developers → Webhooks → Add endpoint:
   `https://app.podiumpersonnel.com/api/billing/webhook`
2. Events to send: `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.paid`, `invoice.payment_failed`
3. Copy the signing secret (`whsec_...`).

## Step 3 — Vercel env (Production)
```
printf 'sk_live_...'  | vercel env add STRIPE_SECRET_KEY production
printf 'whsec_...'    | vercel env add STRIPE_WEBHOOK_SECRET production
printf 'price_...'    | vercel env add STRIPE_PRO_PRICE_ID production
```
(Use `printf`, NOT `echo` — echo appends a newline into the stored value.)

## Step 4 — Flip the switch
```
printf 'true' | vercel env add NEXT_PUBLIC_BILLING_ENABLED production
```
Redeploy (env changes need a new deployment): `vercel redeploy` or push any commit.

## Step 5 — Verify (same day)
- [ ] Founding orgs still Pro: log into Subito dashboard, confirm no trial banner, no gates.
- [ ] Fresh test signup → new org shows 14-day trial countdown.
- [ ] Upgrade flow: test org → Billing → checkout with a REAL card ($29, refund after) →
      org flips to Pro → `stripe_events` table has the event rows.
- [ ] Cancel in Stripe customer portal → org drops to Free at period end.
- [ ] `invoice.payment_failed` path: Stripe test clock or just confirm webhook logs deliver 200s.

## Decided behavior (don't re-litigate)
- New-signup trial: 14 days from org creation (`trial_ends_at` set by signup flow).
- Trial expiry → Free tier (25 musicians / 3 active projects / 1 admin), NOT lockout.
- Comped = `plan_tier='pro'` + no Stripe subscription. Webhook never touches comped orgs
  unless they actually subscribe; cancellation sets `plan_tier='free'` (un-comps), so don't
  run a comped org through a real checkout.
