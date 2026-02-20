import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { PlanProvider } from '@/components/providers/plan-provider'
import { TrialBanner } from '@/components/billing/trial-banner'
import { resolveOrgPlan } from '@/lib/plan'
import type { OrgBilling } from '@/lib/plan'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch membership — always query organization_id first (guaranteed to exist)
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    redirect('/onboarding')
  }

  // Try to fetch billing columns (may not exist if migration hasn't run yet)
  let org: OrgBilling = {
    plan_tier: 'pro',
    trial_ends_at: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: null,
  }
  try {
    const { data: orgData } = await supabase
      .from('organizations')
      .select('plan_tier, trial_ends_at, stripe_customer_id, stripe_subscription_id, subscription_status')
      .eq('id', membership.organization_id)
      .single()
    if (orgData) {
      org = orgData as unknown as OrgBilling
    }
  } catch {
    // Billing columns don't exist yet — use defaults (treats as trial/pro)
  }

  const plan = resolveOrgPlan(org)

  return (
    <PlanProvider plan={plan}>
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header user={{ email: user.email }} />
          <TrialBanner />
          <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </PlanProvider>
  )
}
