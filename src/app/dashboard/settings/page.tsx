import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsClient } from '@/components/settings/settings-client'
import { getOrgStaffingSettings } from '@/lib/staffing/settings'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string; billing?: string }>
}) {
  const { setup, billing } = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select(`
      role,
      organization:organizations(id, name, slug, timezone, vertical, musician_policy, disable_staffing_alerts, email_logo_url, email_brand_color, email_footer_text)
    `)
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    redirect('/onboarding')
  }

  const organization = membership.organization as unknown as {
    id: string
    name: string
    slug: string
    timezone: string
    vertical: string
    musician_policy: string | null
    disable_staffing_alerts: boolean
    email_logo_url: string | null
    email_brand_color: string | null
    email_footer_text: string | null
  }

  // Read on their own so the page still loads if migration 096 is not applied
  // yet (null: the two switches are not shown).
  const staffingSettings = await getOrgStaffingSettings(supabase, organization.id)

  return (
    <SettingsClient
      organization={organization}
      staffingSettings={staffingSettings}
      role={membership.role}
      currentUserId={user.id}
      showSetupPrompt={setup === 'musician_policy'}
      openBillingTab={billing === 'success' || billing === 'cancel'}
    />
  )
}
