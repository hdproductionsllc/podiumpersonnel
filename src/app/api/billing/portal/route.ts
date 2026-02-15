import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { requireOrgAdmin, apiError } from '@/lib/api-helpers'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST() {
  const { user, membership, error } = await requireOrgAdmin()
  if (error || !user || !membership) return error!

  const adminClient = createAdminClient()
  const { data: org } = await adminClient
    .from('organizations')
    .select('stripe_customer_id')
    .eq('id', membership.organization_id)
    .single()

  if (!org?.stripe_customer_id) {
    return apiError('No billing account found. Please subscribe first.', 400)
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
  })

  return NextResponse.json({ url: session.url })
}
