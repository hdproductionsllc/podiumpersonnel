# Billing System QA Checklist

Manual testing guide for the Stripe paywall before launch.
Run through each section with your test org.

---

## ⚠️ Launch state — billing is OFF by default

Plan enforcement is gated behind a single flag: **`NEXT_PUBLIC_BILLING_ENABLED`** (in `src/lib/plan.ts`).

- **Unset / not `'true'` (current default):** billing is **not enforced**. `resolveOrgPlan` returns full **Pro** for every org regardless of trial/subscription state. No paywall, no trial countdown, no free-tier limits. This is the correct pre-launch state.
- **`NEXT_PUBLIC_BILLING_ENABLED=true`:** real resolution kicks in — active/trialing/past_due → Pro; trial window honored via `trial_ends_at` (with days remaining); expired trial or canceled → Free with limits enforced.

So **the trial countdown and free-tier limits only render once the flag is on.** To QA the paywall, set `NEXT_PUBLIC_BILLING_ENABLED=true` in `.env.local` first. To go live with billing, set it in Vercel (Production).

When the flag is on, `getOrgPlan` **fails closed** — if the org row can't be read it returns Free (denies premium features) rather than leaking Pro.

---

## Prerequisites

### Stripe Test Mode Setup
1. Go to [Stripe Dashboard](https://dashboard.stripe.com/test) (make sure you're in **Test mode**)
2. Create a Product called "Podium Pro"
3. Add a Price: **$29/month** recurring
4. Copy the Price ID → set as `STRIPE_PRO_PRICE_ID` in `.env.local`
5. Create a webhook endpoint: `https://your-domain.com/api/billing/webhook`
   - Or for local: use Stripe CLI (see below)
6. Subscribe to events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed` (→ sets `past_due`)
   - `invoice.paid` (→ sets `active`)
7. Copy webhook signing secret → set as `STRIPE_WEBHOOK_SECRET` in `.env.local`

> **Idempotency:** every event id is recorded in the `stripe_events` table (migration 064) and processed at most once, so Stripe retries / replays can't corrupt state. Invoice events (which carry no `organization_id` metadata) resolve the org via `stripe_customer_id`.
8. Set your `STRIPE_SECRET_KEY` (test key, starts with `sk_test_`)

### Stripe CLI for Local Testing
```bash
# Install: https://docs.stripe.com/stripe-cli
stripe login
stripe listen --forward-to localhost:3000/api/billing/webhook
# Copy the webhook signing secret it prints → STRIPE_WEBHOOK_SECRET
```

### Stripe Test Card Numbers
| Card | Scenario |
|------|----------|
| `4242 4242 4242 4242` | Succeeds |
| `4000 0000 0000 3220` | Requires 3D Secure (succeeds after auth) |
| `4000 0000 0000 0341` | Attaches but fails on charge (triggers `past_due`) |
| `4000 0000 0000 9995` | Declines (insufficient funds) |

Use any future expiry date, any CVC, any ZIP.

---

## 1. New Signup & Trial

- [ ] Create a brand new account (sign up fresh)
- [ ] **Verify in Supabase:** `organizations` table → new org has:
  - `plan_tier = 'trial'`
  - `trial_ends_at` = ~14 days from now
  - `stripe_customer_id` = null
  - `stripe_subscription_id` = null
  - `subscription_status` = null
- [ ] Dashboard loads with full Pro access (no limits)
- [ ] Trial banner appears at top showing "X days left"
- [ ] Sidebar shows "Pro Trial — Xd left"

## 2. Trial Countdown & Expiration

- [ ] **Simulate near-expiry:** In Supabase, update your org:
  ```sql
  UPDATE organizations
  SET trial_ends_at = NOW() + INTERVAL '2 days'
  WHERE id = 'YOUR_ORG_ID';
  ```
- [ ] Refresh dashboard → trial banner shows ~2 days, amber color
- [ ] **Simulate expired trial:**
  ```sql
  UPDATE organizations
  SET trial_ends_at = NOW() - INTERVAL '1 day'
  WHERE id = 'YOUR_ORG_ID';
  ```
- [ ] Refresh dashboard → now on Free tier
- [ ] Sidebar shows "Upgrade to Pro" link
- [ ] Trial banner is gone

## 3. Free Tier Limits

After forcing trial expiration (step 2), test each limit:

### Musicians (limit: 25)
- [ ] If you have <25 musicians: can add new ones normally
- [ ] If you have ≥25 musicians: "Add Musician" button is disabled, upgrade prompt shows
- [ ] If you already had >25 from trial: all still visible, just can't add more

### Projects (limit: 3 active)
- [ ] If you have <3 active projects: can create new ones
- [ ] If you have ≥3 active projects: "Add Project" button disabled, upgrade prompt shows
- [ ] Completed/archived projects don't count toward the limit

### Admin Seats (limit: 1)
- [ ] "Add Member" button shows "Add Member (Pro)" and is disabled
- [ ] Owner account still works fine

### Pro-Only Features (all should be blocked on Free)
- [ ] **Import button:** Disabled, tooltip says Pro required
- [ ] **Saved Ensembles:** "Import from Saved Ensemble" and "Save as Preset" disabled
- [ ] **Send Gig Details:** Button disabled on project page
- [ ] **Group Text:** Button disabled on project page
- [ ] **Portal Invites:** Disabled in Musicians view
- [ ] **W-9 Requests:** Disabled in bulk actions

### Always-Free Features (must still work!)
- [ ] **Contract Offers:** Can send offers, track responses, send reminders ← CRITICAL
- [ ] **View all existing data:** Musicians, projects, payments all accessible
- [ ] **Edit existing records:** Can update musician info, project details
- [ ] **Venues and Instruments:** Can manage normally

## 4. Server-Side Enforcement

Test that gated routes actually return 403 (not just client-side disabled):

```bash
# Get your auth cookie/token from the browser dev tools
# Then test each endpoint:

# Should return 403 on free tier:
curl -X POST https://your-app.com/api/musicians/import \
  -H "Cookie: YOUR_AUTH_COOKIE" \
  -F "file=@test.csv"

# Should return 403 on free tier:
curl -X POST https://your-app.com/api/projects/SOME_PROJECT_ID/send-gig-details \
  -H "Cookie: YOUR_AUTH_COOKIE"

# Should SUCCEED on free tier (offers are always free):
curl -X POST https://your-app.com/api/offers/send-email \
  -H "Cookie: YOUR_AUTH_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"positionId": "SOME_POSITION_ID"}'
```

## 5. Stripe Checkout Flow (Upgrade)

- [ ] Make sure `stripe listen` is running locally (or webhook is configured)
- [ ] Click "Upgrade to Pro" from sidebar, billing settings, or any upgrade prompt
- [ ] Redirected to Stripe Checkout page
- [ ] **Use card `4242 4242 4242 4242`** → complete payment
- [ ] Redirected back to `/dashboard/settings?billing=success`
- [ ] Billing tab auto-opens
- [ ] **Verify in Stripe CLI output:** `checkout.session.completed` event received
- [ ] **Verify in Supabase:**
  - `plan_tier = 'pro'`
  - `subscription_status = 'active'`
  - `stripe_subscription_id` = set
  - `stripe_customer_id` = set
- [ ] Dashboard now has full Pro access
- [ ] No trial banner, no "Upgrade" links
- [ ] All previously-disabled buttons now work

## 6. Customer Portal (Manage Subscription)

- [ ] In Settings → Billing, click "Manage Subscription"
- [ ] Stripe Customer Portal opens
- [ ] Can see subscription details ($29/mo)
- [ ] **Cancel subscription** from portal
- [ ] **Verify webhook:** `customer.subscription.deleted` event received
- [ ] **Verify in Supabase:**
  - `plan_tier = 'free'`
  - `subscription_status = 'canceled'`
  - `stripe_subscription_id` = null
- [ ] Dashboard drops to Free tier immediately
- [ ] Limits re-engaged

## 7. Payment Failure (Past Due)

- [ ] Re-subscribe using card `4242 4242 4242 4242`
- [ ] In Stripe Dashboard → Subscriptions → find the subscription
- [ ] Click "Actions" → "Update payment method" → use card `4000 0000 0000 0341`
- [ ] Wait for next invoice attempt (or trigger manually in Stripe)
- [ ] **Verify webhook:** `customer.subscription.updated` with `status: past_due`
- [ ] Dashboard shows red "Update Payment" banner
- [ ] User still has Pro access (grace period while Stripe retries)
- [ ] "Update Payment" button opens Customer Portal

## 8. Re-subscribe After Cancellation

- [ ] After canceling (step 6), click "Upgrade to Pro" again
- [ ] Stripe Checkout opens — should reuse existing Stripe customer
- [ ] Complete payment with `4242 4242 4242 4242`
- [ ] **Verify:** org flips back to Pro, everything works

## 9. Edge Cases

- [ ] **Double webhook:** Replay a webhook event (Stripe Dashboard → Webhooks → resend) — data should not corrupt
- [ ] **Cancel mid-page:** Start Checkout, close the tab, come back to app — nothing should break
- [ ] **Multiple browser tabs:** Open settings in two tabs, upgrade in one → other tab should reflect Pro on refresh
- [ ] **Non-admin clicks upgrade:** Regular members shouldn't see upgrade buttons (they do see limits though)

## 10. Database Migration (Production)

When ready to go live:

- [ ] Run `supabase/migrations/046_add_billing.sql` on production
- [ ] **Verify all existing orgs** get `plan_tier = 'trial'` and `trial_ends_at` 14 days out
- [ ] Existing users can still log in and use the app normally
- [ ] No data loss — all musicians, projects, etc. still present
- [ ] Switch Stripe from test mode to live mode
- [ ] Update env vars: `STRIPE_SECRET_KEY` (live), `STRIPE_WEBHOOK_SECRET` (live), `STRIPE_PRO_PRICE_ID` (live)

---

## Quick Reset SQL

Use these to reset your test org between test runs:

```sql
-- Reset to fresh trial (14 days)
UPDATE organizations
SET plan_tier = 'trial',
    trial_ends_at = NOW() + INTERVAL '14 days',
    stripe_customer_id = NULL,
    stripe_subscription_id = NULL,
    subscription_status = NULL
WHERE id = 'YOUR_ORG_ID';

-- Force to free tier (expired trial, no subscription)
UPDATE organizations
SET plan_tier = 'free',
    trial_ends_at = NOW() - INTERVAL '1 day',
    stripe_customer_id = NULL,
    stripe_subscription_id = NULL,
    subscription_status = NULL
WHERE id = 'YOUR_ORG_ID';

-- Simulate active Pro subscription (without Stripe)
UPDATE organizations
SET plan_tier = 'pro',
    subscription_status = 'active',
    stripe_customer_id = 'cus_test',
    stripe_subscription_id = 'sub_test'
WHERE id = 'YOUR_ORG_ID';

-- Simulate past_due
UPDATE organizations
SET plan_tier = 'pro',
    subscription_status = 'past_due'
WHERE id = 'YOUR_ORG_ID';
```
