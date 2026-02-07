import { createClient } from '@/lib/supabase/server'
import { SchedulesClient, type ScheduleWithMusician } from '@/components/schedules/schedules-client'

export default async function SchedulesPage() {
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

  // Fetch competing schedules with musician info
  const { data: schedules } = await supabase
    .from('competing_schedules')
    .select(`
      *,
      musician:musicians(id, first_name, last_name)
    `)
    .in(
      'musician_id',
      (await supabase
        .from('musicians')
        .select('id')
        .eq('organization_id', organization!.id)
      ).data?.map((m) => m.id) ?? []
    )
    .order('start_time', { ascending: true })

  // Fetch active musicians for the form
  const { data: musicians } = await supabase
    .from('musicians')
    .select('id, first_name, last_name')
    .eq('organization_id', organization!.id)
    .eq('is_active', true)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })

  return (
    <SchedulesClient
      schedules={(schedules as unknown as ScheduleWithMusician[]) ?? []}
      musicians={musicians ?? []}
      canManage={membership!.role === 'owner' || membership!.role === 'admin'}
    />
  )
}
