import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { PlanProvider } from '@/components/providers/plan-provider'
import { VerticalProvider } from '@/components/providers/vertical-provider'
import { OrgFlagsProvider } from '@/components/providers/org-flags-provider'
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

  // Fetch membership — always query organization_id first (guaranteed to exist).
  // limit(1) + maybeSingle instead of single(): if a user ever ends up with two
  // membership rows (e.g. a double org creation), single() errors and locks them
  // into a redirect loop; picking the first membership keeps the dashboard usable.
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) {
    redirect('/onboarding')
  }

  // Try to fetch billing columns (may not exist if migration hasn't run yet)
  let org: OrgBilling = {
    plan_tier: 'free',
    trial_ends_at: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: null,
    is_comped: true,
  }
  try {
    const { data: orgData } = await supabase
      .from('organizations')
      .select('plan_tier, trial_ends_at, stripe_customer_id, stripe_subscription_id, subscription_status, is_comped')
      .eq('id', membership.organization_id)
      .single()
    if (orgData) {
      org = orgData as unknown as OrgBilling
    }
  } catch {
    // Billing columns don't exist yet — use defaults (treats as trial/pro)
  }

  const plan = resolveOrgPlan(org)

  // Fetch the vertical key separately so a missing column (migration 065 not
  // yet applied) can't disturb the billing query above. Null → default template.
  let verticalKey: string | null = null
  try {
    const { data: verticalData } = await supabase
      .from('organizations')
      .select('vertical')
      .eq('id', membership.organization_id)
      .single()
    verticalKey = (verticalData as { vertical?: string } | null)?.vertical ?? null
  } catch {
    // Column doesn't exist yet — default template
  }

  // Fetch the intake feature flag separately so a missing column (migration 073
  // not yet applied) can't disturb the queries above. Fails closed to false.
  let intakeEnabled = false
  try {
    const { data: flagData } = await supabase
      .from('organizations')
      .select('intake_enabled')
      .eq('id', membership.organization_id)
      .single()
    intakeEnabled = (flagData as { intake_enabled?: boolean } | null)?.intake_enabled === true
  } catch {
    // Column doesn't exist yet — feature stays hidden
  }

  return (
    <VerticalProvider verticalKey={verticalKey}>
    <OrgFlagsProvider flags={{ intakeEnabled }}>
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
    </OrgFlagsProvider>
    </VerticalProvider>
  )
}
