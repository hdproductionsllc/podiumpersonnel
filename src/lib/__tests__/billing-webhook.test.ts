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
  // Only used by the invoice-event tests below, where resolveOrgId falls back
  // to looking the org up by stripe_customer_id (invoice events carry no
  // metadata.organization_id).
  customerToOrg: {} as Record<string, string>,
  reset() {
    this.event = undefined
    this.orgUpdateError = null
    this.orgUpdates = []
    this.dedupInserts = []
    this.dedupDeletes = []
    this.customerToOrg = {}
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
      let selectFilterValue: unknown
      const builder: any = {
        select() {
          op = 'select'
          return builder
        },
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
        eq(column: string, value: unknown) {
          if (table === 'organizations' && op === 'update') {
            fake.orgUpdates.push({ orgId: value, patch })
            return Promise.resolve({ error: fake.orgUpdateError })
          }
          if (table === 'stripe_events' && op === 'delete') {
            fake.dedupDeletes.push(String(value))
            return Promise.resolve({ error: null })
          }
          if (table === 'organizations' && op === 'select' && column === 'stripe_customer_id') {
            selectFilterValue = value
            return builder // chainable — resolveOrgId calls .maybeSingle() next
          }
          return Promise.resolve({ data: null, error: null })
        },
        maybeSingle() {
          if (table === 'organizations' && op === 'select') {
            const orgId = fake.customerToOrg[String(selectFilterValue)] ?? null
            return Promise.resolve({ data: orgId ? { id: orgId } : null, error: null })
          }
          return Promise.resolve({ data: null, error: null })
        },
      }
      return builder
    },
  }),
}))

const paymentFailedEmail = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@/lib/email/billing-notices', () => ({
  sendPaymentFailedEmail: paymentFailedEmail,
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

describe('Stripe webhook — payment-failed dunning email (A8, behavioral)', () => {
  // Invoice events carry no metadata.organization_id — resolveOrgId falls back
  // to the stripe_customer_id lookup for these, unlike the subscription
  // fixtures above.
  const paymentFailedInvoice = (eventId: string) => ({
    id: eventId,
    type: 'invoice.payment_failed',
    data: {
      object: {
        id: 'in_1',
        customer: 'cus_1',
        amount_due: 7900,
        currency: 'usd',
        next_payment_attempt: 1737331200,
        hosted_invoice_url: 'https://invoice.stripe.com/i/xyz',
      },
    },
  })

  const invoicePaid = (eventId: string) => ({
    id: eventId,
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_2',
        customer: 'cus_1',
        subscription: 'sub_1',
        lines: { data: [{ price: { id: 'price_unknown' } }] },
      },
    },
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
    fake.customerToOrg['cus_1'] = 'org-1'
    paymentFailedEmail.mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends the dunning email AFTER the durable past_due write, on invoice.payment_failed', async () => {
    fake.event = paymentFailedInvoice('evt_pf')

    const res = await post()

    expect(res.status).toBe(200)
    expect(fake.orgUpdates).toHaveLength(1)
    expect(fake.orgUpdates[0]).toMatchObject({ orgId: 'org-1', patch: { subscription_status: 'past_due' } })
    expect(paymentFailedEmail).toHaveBeenCalledTimes(1)
    expect(paymentFailedEmail).toHaveBeenCalledWith('org-1', {
      amountDue: 7900,
      currency: 'usd',
      nextPaymentAttempt: 1737331200,
      hostedInvoiceUrl: 'https://invoice.stripe.com/i/xyz',
    })
  })

  it('never sends the dunning email on invoice.paid', async () => {
    fake.event = invoicePaid('evt_paid')

    const res = await post()

    expect(res.status).toBe(200)
    expect(paymentFailedEmail).not.toHaveBeenCalled()
  })

  it('does not send the dunning email when the past_due write itself fails', async () => {
    // The route returns 500 before reaching the email call in this branch —
    // an email must never imply the DB write succeeded when it didn't.
    fake.event = paymentFailedInvoice('evt_pf_fail')
    fake.orgUpdateError = { message: 'connection reset' }

    const res = await post()

    expect(res.status).toBe(500)
    expect(paymentFailedEmail).not.toHaveBeenCalled()
  })
})
