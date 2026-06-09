import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'

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

      await adminClient
        .from('organizations')
        .update({
          plan_tier: 'pro',
          subscription_status: 'active',
          stripe_subscription_id: session.subscription as string,
        })
        .eq('id', orgId)
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
      const planTier = ['active', 'trialing', 'past_due'].includes(status) ? 'pro' : 'free'

      await adminClient
        .from('organizations')
        .update({
          plan_tier: planTier,
          subscription_status: status,
          stripe_subscription_id: subscription.id,
        })
        .eq('id', orgId)
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

      await adminClient
        .from('organizations')
        .update({
          plan_tier: 'free',
          subscription_status: 'canceled',
          stripe_subscription_id: null,
        })
        .eq('id', orgId)
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const orgId = await resolveOrgId(adminClient, undefined, (invoice.customer as string) ?? null)
      if (!orgId) break

      // Enter grace period — resolveOrgPlan keeps past_due as Pro while Stripe retries.
      await adminClient
        .from('organizations')
        .update({ subscription_status: 'past_due' })
        .eq('id', orgId)
      break
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice
      // Only subscription invoices affect plan state.
      if (!(invoice as { subscription?: unknown }).subscription) break
      const orgId = await resolveOrgId(adminClient, undefined, (invoice.customer as string) ?? null)
      if (!orgId) break

      await adminClient
        .from('organizations')
        .update({ plan_tier: 'pro', subscription_status: 'active' })
        .eq('id', orgId)
      break
    }
  }

  return NextResponse.json({ received: true })
}
