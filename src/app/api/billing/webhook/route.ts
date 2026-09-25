import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { priceIdToTier, type PaidTier } from '@/lib/plan'
import { sendPaymentFailedEmail } from '@/lib/email/billing-notices'
import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'

function validPaidTier(t: unknown): PaidTier | null {
  return t === 'ensemble' || t === 'orchestra' || t === 'symphony' ? t : null
}

/** Which paid tier a subscription is on, from its price (fallback: metadata). */
function tierFromSubscription(sub: Stripe.Subscription): PaidTier {
  const priceId = sub.items?.data?.[0]?.price?.id
  return priceIdToTier(priceId) ?? validPaidTier(sub.metadata?.tier) ?? 'ensemble'
}

/** An id from a field Stripe sends either as a bare id or an expanded object. */
function idOf(ref: string | { id?: string } | null | undefined): string | null {
  if (!ref) return null
  return typeof ref === 'string' ? ref : ref.id ?? null
}

// Stripe's 2025-03-31 ("basil") API moved these invoice fields. The payload
// shape follows the webhook endpoint's API version, not this SDK's, so read
// the current location first and fall back to the legacy one.
type LegacyInvoice = { subscription?: string | { id?: string } | null }
type LegacyLine = { price?: { id?: string } | null }

/** The subscription an invoice bills, or null for a one-off invoice. */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  return (
    idOf(invoice.parent?.subscription_details?.subscription) ??
    idOf((invoice as unknown as LegacyInvoice).subscription)
  )
}

/** The price on an invoice's first line — what the customer is paying for. */
function invoicePriceId(invoice: Stripe.Invoice): string | null {
  const line = invoice.lines?.data?.[0]
  if (!line) return null
  return idOf(line.pricing?.price_details?.price) ?? idOf((line as unknown as LegacyLine).price)
}

/**
 * Resolve which org an event belongs to. Subscription/checkout events carry
 * organization_id in metadata; invoice events don't, so fall back to looking up
 * the org by its Stripe customer id. Logs and returns null when neither works.
 */
async function resolveOrgId(
  adminClient: SupabaseClient,
  metadataOrgId: string | undefined,
  customerId: string | null
): Promise<string | null> {
  if (metadataOrgId) return metadataOrgId
  if (customerId) {
    const { data } = await adminClient
      .from('organizations')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()
    if (data?.id) return data.id
  }
  console.error(
    `Stripe webhook: could not resolve org (metadata org=${metadataOrgId ?? 'none'}, customer=${customerId ?? 'none'})`
  )
  return null
}

/**
 * Apply a subscription change to the org row. Returns null on success.
 *
 * On failure the event's idempotency row is removed so Stripe's retry is
 * processed rather than acked as a duplicate, and a 500 is returned so Stripe
 * actually retries. Without this a failed write would leave the org on the
 * wrong plan forever while every retry was silently thrown away.
 */
async function applyOrgUpdate(
  adminClient: SupabaseClient,
  eventId: string,
  eventType: string,
  orgId: string,
  patch: Record<string, unknown>
): Promise<NextResponse | null> {
  const { error: updateError } = await adminClient
    .from('organizations')
    .update(patch)
    .eq('id', orgId)
  if (!updateError) return null

  console.error(`Stripe webhook: failed to apply ${eventType} to org ${orgId}:`, updateError)

  const { error: releaseError } = await adminClient
    .from('stripe_events')
    .delete()
    .eq('id', eventId)
  if (releaseError) {
    console.error(`Stripe webhook: failed to release dedup row for ${eventId}:`, releaseError)
  }

  return NextResponse.json({ error: 'Failed to apply subscription change' }, { status: 500 })
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Webhook signature verification failed:', message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Idempotency: record the event id. A unique-violation means we've already
  // processed this event (Stripe retry / duplicate) — ack and stop.
  const { error: dedupError } = await adminClient
    .from('stripe_events')
    .insert({ id: event.id, type: event.type })
  if (dedupError) {
    if (dedupError.code === '23505') {
      return NextResponse.json({ received: true, duplicate: true })
    }
    // Non-duplicate failure (e.g. table missing): log but still process so a
    // real event isn't dropped.
    console.error('stripe_events insert failed (continuing):', dedupError)
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const orgId = await resolveOrgId(
        adminClient,
        session.metadata?.organization_id,
        (session.customer as string) ?? null
      )
      if (!orgId || !session.subscription) break

      const tier = validPaidTier(session.metadata?.tier) ?? 'ensemble'
      const failed = await applyOrgUpdate(adminClient, event.id, event.type, orgId, {
        plan_tier: tier,
        subscription_status: 'active',
        stripe_subscription_id: session.subscription as string,
      })
      if (failed) return failed
      break
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const orgId = await resolveOrgId(
        adminClient,
        subscription.metadata?.organization_id,
        (subscription.customer as string) ?? null
      )
      if (!orgId) break

      const status = subscription.status
      const planTier = ['active', 'trialing', 'past_due'].includes(status)
        ? tierFromSubscription(subscription)
        : 'free'

      const failed = await applyOrgUpdate(adminClient, event.id, event.type, orgId, {
        plan_tier: planTier,
        subscription_status: status,
        stripe_subscription_id: subscription.id,
      })
      if (failed) return failed
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const orgId = await resolveOrgId(
        adminClient,
        subscription.metadata?.organization_id,
        (subscription.customer as string) ?? null
      )
      if (!orgId) break

      const failed = await applyOrgUpdate(adminClient, event.id, event.type, orgId, {
        plan_tier: 'free',
        subscription_status: 'canceled',
        stripe_subscription_id: null,
      })
      if (failed) return failed
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const orgId = await resolveOrgId(adminClient, undefined, (invoice.customer as string) ?? null)
      if (!orgId) break

      // Enter grace period — resolveOrgPlan keeps past_due at the paid tier while
      // Stripe retries. plan_tier is left untouched so we don't lose the tier.
      const failed = await applyOrgUpdate(adminClient, event.id, event.type, orgId, {
        subscription_status: 'past_due',
      })
      if (failed) return failed

      // Dunning email — AFTER the durable DB write, never before. Never throws
      // (see billing-notices.ts) — an email hiccup must not fail this webhook.
      await sendPaymentFailedEmail(orgId, {
        amountDue: invoice.amount_due ?? null,
        currency: invoice.currency ?? null,
        nextPaymentAttempt: invoice.next_payment_attempt ?? null,
        hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      })
      break
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice
      // Only subscription invoices affect plan state.
      if (!invoiceSubscriptionId(invoice)) break
      const orgId = await resolveOrgId(adminClient, undefined, (invoice.customer as string) ?? null)
      if (!orgId) break

      // Map the invoiced price to a tier. If we can't (unknown price), only
      // confirm the status active — never blindly downgrade an existing tier.
      const paidTier = priceIdToTier(invoicePriceId(invoice))
      const failed = await applyOrgUpdate(
        adminClient,
        event.id,
        event.type,
        orgId,
        paidTier ? { plan_tier: paidTier, subscription_status: 'active' } : { subscription_status: 'active' }
      )
      if (failed) return failed
      break
    }
  }

  return NextResponse.json({ received: true })
}
