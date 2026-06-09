import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Billing webhook hardening audit (Phase 4).
 * Locks in idempotency, the additional Stripe events, the customer→org fallback,
 * and the explicit billing-launch flag.
 */

const root = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf-8')

describe('Stripe webhook', () => {
  const src = read('src/app/api/billing/webhook/route.ts')

  it('verifies the signature', () => {
    expect(src).toContain('stripe-signature')
    expect(src).toContain('constructEvent')
  })

  it('is idempotent via the stripe_events table', () => {
    expect(src).toContain("from('stripe_events')")
    expect(src).toContain('event.id')
    expect(src).toContain("'23505'") // unique violation → already processed
  })

  it('handles all required subscription + invoice events', () => {
    for (const evt of [
      'checkout.session.completed',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.payment_failed',
      'invoice.paid',
    ]) {
      expect(src, `missing handler for ${evt}`).toContain(evt)
    }
  })

  it('falls back to resolving the org by stripe_customer_id', () => {
    expect(src).toContain('resolveOrgId')
    expect(src).toContain("eq('stripe_customer_id', customerId)")
  })

  it('marks past_due on payment failure and active on invoice.paid', () => {
    expect(src).toContain("subscription_status: 'past_due'")
    expect(src).toContain("subscription_status: 'active'")
  })
})

describe('billing-launch flag', () => {
  const plan = read('src/lib/plan.ts')
  it('resolveOrgPlan is gated behind isBillingEnabled', () => {
    expect(plan).toContain('NEXT_PUBLIC_BILLING_ENABLED')
    expect(plan).toContain('if (!isBillingEnabled())')
  })
  it('honors trial_ends_at when billing is enabled', () => {
    expect(plan).toContain('trial_ends_at')
    expect(plan).toContain('trialDaysRemaining')
  })
  it('getOrgPlan fails closed when billing is enabled', () => {
    const helpers = read('src/lib/api-helpers.ts')
    expect(helpers).toContain('isBillingEnabled()')
    expect(helpers).toContain("tier: 'free'")
  })
})

describe('idempotency migration', () => {
  it('creates the stripe_events table', () => {
    const migration = read('supabase/migrations/064_stripe_event_idempotency.sql')
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS stripe_events/i)
    expect(migration).toMatch(/id TEXT PRIMARY KEY/i)
  })
})
