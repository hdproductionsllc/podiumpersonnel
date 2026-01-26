import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsClient } from '@/components/settings/settings-client'

export default async function SettingsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select(`
      role,
      organization:organizations(id, name, slug, timezone, musician_policy)
    `)
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    redirect('/onboarding')
  }

  const organization = membership.organization as unknown as { id: string; name: string; slug: string; timezone: string; musician_policy: string | null }

  return (
    <SettingsClient
      organization={organization}
      role={membership.role}
      currentUserId={user.id}
    />
  )
}
