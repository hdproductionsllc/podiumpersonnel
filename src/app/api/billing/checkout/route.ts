import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { requireOrgAdmin, apiError } from '@/lib/api-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { tierToPriceId, type PaidTier } from '@/lib/plan'

const PAID_TIERS: PaidTier[] = ['ensemble', 'orchestra', 'symphony']

export async function POST(request: Request) {
  const { user, membership, error } = await requireOrgAdmin()
  if (error || !user || !membership) return error!

  // Which tier is being purchased? (defaults to the entry paid tier)
  let tier: PaidTier = 'ensemble'
  try {
    const body = await request.json()
    if (PAID_TIERS.includes(body?.tier)) tier = body.tier
  } catch {
    // no body — use default
  }

  const priceId = tierToPriceId(tier)
  if (!priceId) return apiError('That plan is not available right now. Please contact support.', 400)

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

    const { error: saveCustomerError } = await adminClient
      .from('organizations')
      .update({ stripe_customer_id: customerId })
      .eq('id', org.id)

    if (saveCustomerError) {
      // Checkout still works with the customer we just made; the cost of not
      // saving it is a second Stripe customer on the next attempt.
      console.error(`Failed to save Stripe customer ${customerId} on org ${org.id}:`, saveCustomerError)
    }
  }

  const session = await getStripe().checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    allow_promotion_codes: true,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?billing=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?billing=cancel`,
    metadata: { organization_id: org.id, tier },
    subscription_data: {
      metadata: { organization_id: org.id, tier },
    },
  })

  return NextResponse.json({ url: session.url })
}
