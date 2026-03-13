import { createClient } from '@/lib/supabase/server'
import { PaymentsClient, type PaymentWithRelations } from '@/components/payments/payments-client'

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; status?: string }>
}) {
  const params = await searchParams
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

  // Fetch payments with related data
  const { data: payments } = await supabase
    .from('payments')
    .select(`
      *,
      musician:musicians(
        id,
        first_name,
        last_name,
        email,
        phone,
        w9_on_file,
        zelle_method,
        zelle_verified
      ),
      position:project_positions(
        instrument:instruments(id, name, abbreviation)
      ),
      service:services(
        id,
        name,
        service_type,
        start_time,
        base_pay,
        leader_fee,
        project:projects(
          id,
          name
        )
      )
    `)
    .eq('organization_id', organization!.id)
    .order('created_at', { ascending: false })

  // Fetch projects for filter dropdown
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('organization_id', organization!.id)
    .order('name', { ascending: true })

  return (
    <PaymentsClient
      payments={(payments as unknown as PaymentWithRelations[]) ?? []}
      projects={projects ?? []}
      organizationId={organization!.id}
      userRole={membership!.role}
      initialProjectFilter={params.project || ''}
      initialStatusFilter={params.status || ''}
    />
  )
}
