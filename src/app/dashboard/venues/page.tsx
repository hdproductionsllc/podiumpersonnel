import { createClient } from '@/lib/supabase/server'
import { VenuesClient } from '@/components/venues/venues-client'

export default async function VenuesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('organization_members')
    .select(`
      role,
      organization:organizations(
        id,
        name,
        slug
      )
    `)
    .eq('user_id', user!.id)
    .single()

  const organization = membership?.organization as unknown as {
    id: string
    name: string
    slug: string
  } | null

  // Fetch venues
  const { data: venues } = await supabase
    .from('venues')
    .select('*')
    .eq('organization_id', organization!.id)
    .order('name', { ascending: true })

  return (
    <VenuesClient
      venues={venues ?? []}
      organizationId={organization!.id}
      userRole={membership!.role}
    />
  )
}
