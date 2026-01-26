import { createClient } from '@/lib/supabase/server'
import { ProjectsClient } from '@/components/projects/projects-client'

export default async function ProjectsPage() {
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

  // Fetch projects with their services, positions, and offers
  const { data: projects } = await supabase
    .from('projects')
    .select(`
      *,
      services(*),
      project_positions(
        id,
        project_id,
        instrument_id,
        chair_number,
        musician_id,
        status,
        notes,
        instrument:instruments(id, name, section, sort_order),
        musician:musicians(id, first_name, last_name),
        contract_offers(id, musician_id, status, sent_at, expires_at, responded_at, token, musician:musicians(id, first_name, last_name)),
        substitution_requests(id, requesting_musician_id, service_id, reason, status, substitute_musician_id, requesting_musician:musicians!substitution_requests_requesting_musician_id_fkey(id, first_name, last_name), substitute_musician:musicians!substitution_requests_substitute_musician_id_fkey(id, first_name, last_name), service:services(id, name, start_time))
      )
    `)
    .eq('organization_id', organization!.id)
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true })

  // Fetch books with entries for import dialog
  const { data: books } = await supabase
    .from('books')
    .select(`
      id,
      name,
      book_entries(instrument_id, chair_number, musician_id)
    `)
    .eq('organization_id', organization!.id)
    .order('name', { ascending: true })

  // Fetch active musicians with instrument assignments and schedules for offer dialog + conflict detection
  const { data: musicians } = await supabase
    .from('musicians')
    .select(`
      id, first_name, last_name, email,
      musician_instruments(instrument_id),
      competing_schedules(id, title, start_time, end_time)
    `)
    .eq('organization_id', organization!.id)
    .eq('is_active', true)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })

  return (
    <ProjectsClient
      projects={(projects as any) ?? []}
      books={(books as any) ?? []}
      musicians={(musicians as any) ?? []}
      organizationId={organization!.id}
      userRole={membership!.role}
    />
  )
}
