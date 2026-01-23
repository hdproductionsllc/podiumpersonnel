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

  // Fetch projects with their services
  const { data: projects } = await supabase
    .from('projects')
    .select(`
      *,
      services(*)
    `)
    .eq('organization_id', organization!.id)
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true })

  return (
    <ProjectsClient
      projects={(projects as any) ?? []}
      organizationId={organization!.id}
      userRole={membership!.role}
    />
  )
}
