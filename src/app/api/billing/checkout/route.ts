import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { requireOrgAdmin, apiError } from '@/lib/api-helpers'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST() {
  const { supabase, user, membership, error } = await requireOrgAdmin()
  if (error || !user || !membership) return error!

  // Fetch org billing info
  const adminClient = createAdminClient()
  const { data: org } = await adminClient
    .from('organizations')
    .select('id, name, stripe_customer_id')
    .eq('id', membership.organization_id)
    .single()

  if (!org) return apiError('Organization not found', 404)

  // Create or reuse Stripe customer
  let customerId = org.stripe_customer_id
  if (!customerId) {
    const customer = await getStripe().customers.create({
      email: user.email!,
      metadata: { organization_id: org.id, organization_name: org.name },
    })
    customerId = customer.id

    await adminClient
      .from('organizations')
      .update({ stripe_customer_id: customerId })
      .eq('id', org.id)
  }

  // Create Checkout Session
  const session = await getStripe().checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID!, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?billing=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?billing=cancel`,
    metadata: { organization_id: org.id },
    subscription_data: {
      metadata: { organization_id: org.id },
    },
  })

  return NextResponse.json({ url: session.url })
}
