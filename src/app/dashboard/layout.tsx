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

  // Fetch membership with billing columns
  const { data: membership } = await supabase
    .from('organization_members')
    .select(`
      organization_id,
      organization:organizations(
        plan_tier,
        trial_ends_at,
        stripe_customer_id,
        stripe_subscription_id,
        subscription_status
      )
    `)
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    redirect('/onboarding')
  }

  const org = membership.organization as unknown as OrgBilling
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
