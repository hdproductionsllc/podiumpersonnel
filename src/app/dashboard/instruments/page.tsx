import { createClient } from '@/lib/supabase/server'
import { InstrumentsClient, type InstrumentWithMusicians } from '@/components/instruments/instruments-client'

export default async function InstrumentsPage() {
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

  const { data: instruments } = await supabase
    .from('instruments')
    .select(`
      *,
      musician_instruments(
        id,
        musician:musicians(id, first_name, last_name, email, is_active)
      )
    `)
    .eq('organization_id', organization!.id)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  return (
    <InstrumentsClient
      instruments={(instruments as unknown as InstrumentWithMusicians[]) ?? []}
      organizationId={organization!.id}
      userRole={membership!.role}
    />
  )
}
