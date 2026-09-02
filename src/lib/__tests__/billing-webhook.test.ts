import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Billing webhook hardening audit (Phase 4).
 * Locks in idempotency, the additional Stripe events, the customer→org fallback,
 * and the explicit billing-launch flag.
 *
 * The behavioral block at the bottom drives the real POST handler against a
 * tiny admin-client fake so the failure path — org update rejected → dedup row
 * released → 500 so Stripe retries — is exercised, not just grepped for.
 */

const root = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf-8')

// ---------------------------------------------------------------------------
// Fakes for the behavioral block (hoisted so the vi.mock factories can see them)
// ---------------------------------------------------------------------------

const fake = vi.hoisted(() => ({
  event: undefined as any,
  orgUpdateError: null as null | { message: string },
  orgUpdates: [] as Array<{ orgId: unknown; patch: unknown }>,
  dedupInserts: [] as string[],
  dedupDeletes: [] as string[],
  reset() {
    this.event = undefined
    this.orgUpdateError = null
    this.orgUpdates = []
    this.dedupInserts = []
    this.dedupDeletes = []
  },
}))

vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({ webhooks: { constructEvent: () => fake.event } }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      let op: 'select' | 'update' | 'delete' = 'select'
      let patch: unknown
      const builder: any = {
        insert(row: { id: string }) {
          fake.dedupInserts.push(row.id)
          return Promise.resolve({ error: null })
        },
        update(p: unknown) {
          op = 'update'
          patch = p
          return builder
        },
        delete() {
          op = 'delete'
          return builder
        },
        eq(_column: string, value: unknown) {
          if (table === 'organizations' && op === 'update') {
            fake.orgUpdates.push({ orgId: value, patch })
            return Promise.resolve({ error: fake.orgUpdateError })
          }
          if (table === 'stripe_events' && op === 'delete') {
            fake.dedupDeletes.push(String(value))
            return Promise.resolve({ error: null })
          }
          return Promise.resolve({ data: null, error: null })
        },
      }
      return builder
    },
  }),
}))

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

describe('Stripe webhook — org update failure (behavioral)', () => {
  // metadata.organization_id lets resolveOrgId return early, so the fake never
  // has to answer the customer-id lookup.
  const subscriptionDeleted = (eventId: string) => ({
    id: eventId,
    type: 'customer.subscription.deleted',
    data: { object: { id: 'sub_1', customer: 'cus_1', metadata: { organization_id: 'org-1' } } },
  })

  async function post() {
    const { POST } = await import('@/app/api/billing/webhook/route')
    return POST(
      new NextRequest('http://localhost/api/billing/webhook', {
        method: 'POST',
        body: '{}',
        headers: { 'stripe-signature': 'sig' },
      })
    )
  }

  beforeEach(() => {
    fake.reset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('applies the change, keeps the dedup row, and acks on success', async () => {
    fake.event = subscriptionDeleted('evt_ok')

    const res = await post()

    expect(res.status).toBe(200)
    expect(fake.dedupInserts).toEqual(['evt_ok'])
    expect(fake.orgUpdates).toHaveLength(1)
    expect(fake.orgUpdates[0].orgId).toBe('org-1')
    expect(fake.orgUpdates[0].patch).toMatchObject({ plan_tier: 'free', subscription_status: 'canceled' })
    expect(fake.dedupDeletes).toEqual([])
  })

  it('returns 500 and releases the dedup row when the org update fails', async () => {
    // Without this, a failed write would be acked as processed and every Stripe
    // retry would then be discarded as a duplicate — the org stuck on the wrong plan.
    fake.event = subscriptionDeleted('evt_fail')
    fake.orgUpdateError = { message: 'connection reset' }

    const res = await post()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Failed to apply subscription change' })
    expect(fake.dedupInserts).toEqual(['evt_fail'])
    expect(fake.dedupDeletes).toEqual(['evt_fail'])
    expect(console.error).toHaveBeenCalled()
  })
})
