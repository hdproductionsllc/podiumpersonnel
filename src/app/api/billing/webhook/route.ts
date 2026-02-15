import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import type Stripe from 'stripe'

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

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const orgId = session.metadata?.organization_id
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

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const orgId = subscription.metadata?.organization_id
      if (!orgId) break

      const status = subscription.status
      const planTier = ['active', 'trialing', 'past_due'].includes(status)
        ? 'pro'
        : 'free'

      await adminClient
        .from('organizations')
        .update({
          plan_tier: planTier,
          subscription_status: status,
        })
        .eq('id', orgId)
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const orgId = subscription.metadata?.organization_id
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
  }

  return NextResponse.json({ received: true })
}
