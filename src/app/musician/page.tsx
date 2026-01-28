import { redirect } from 'next/navigation'
import { createClient, resolveMusicianIds } from '@/lib/supabase/server'
import { DashboardClient, DashboardSkeleton } from '@/components/musician/dashboard-client'
import { Suspense } from 'react'

async function DashboardContent({ impersonateId }: { impersonateId?: string }) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/musician/login')
  }

  // Resolve musician IDs (supports admin impersonation)
  const { musicianIds: resolvedIds, error: resolveError } = await resolveMusicianIds(
    supabase, user.id, impersonateId
  )

  if (resolveError || resolvedIds.length === 0) {
    redirect('/musician/login?error=no_musician_records')
  }

  // Get full musician data for the resolved IDs
  const { data: musicians, error: musiciansError } = await supabase
    .from('musicians')
    .select(`
      id,
      first_name,
      last_name,
      email,
      organization_id,
      organization:organizations(id, name, timezone, email_logo_url)
    `)
    .in('id', resolvedIds)
    .eq('is_active', true)

  if (musiciansError || !musicians || musicians.length === 0) {
    redirect('/musician/login?error=no_musician_records')
  }

  const musicianIds = musicians.map((m) => m.id)
  const primaryMusician = musicians[0]

  // Get pending offers
  const { data: pendingOffers } = await supabase
    .from('contract_offers')
    .select(`
      id,
      token,
      status,
      custom_pay,
      expires_at,
      created_at,
      musician:musicians(
        id,
        first_name,
        last_name,
        organization:organizations(id, name, timezone, email_logo_url)
      ),
      project_position:project_positions(
        id,
        chair_number,
        instrument:instruments(id, name),
        project:projects(
          id,
          name,
          description,
          start_date,
          end_date
        )
      )
    `)
    .in('musician_id', musicianIds)
    .in('status', ['pending', 'viewed'])
    .order('expires_at', { ascending: true, nullsFirst: false })

  // Get upcoming services (next 30 days) for confirmed positions
  const now = new Date()
  const thirtyDaysLater = new Date()
  thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30)

  // First get confirmed positions for this user's musicians
  const { data: confirmedPositions } = await supabase
    .from('project_positions')
    .select(`
      id,
      chair_number,
      musician_id,
      instrument:instruments(id, name),
      project:projects(
        id,
        name,
        organization_id,
        organization:organizations(id, name, timezone)
      )
    `)
    .in('musician_id', musicianIds)
    .eq('status', 'confirmed')

  let upcomingServices: any[] = []

  if (confirmedPositions && confirmedPositions.length > 0) {
    const projectIds = [...new Set(confirmedPositions.map((p: any) => p.project?.id).filter(Boolean))]

    if (projectIds.length > 0) {
      const { data: services } = await supabase
        .from('services')
        .select(`
          id,
          name,
          service_type,
          start_time,
          end_time,
          venue,
          venue_id,
          base_pay,
          project_id,
          venue_info:venues(id, name, address, city, state)
        `)
        .in('project_id', projectIds)
        .gte('start_time', now.toISOString())
        .lte('start_time', thirtyDaysLater.toISOString())
        .order('start_time', { ascending: true })
        .limit(20)

      if (services) {
        // Enrich services with project and position info
        upcomingServices = services.map((service: any) => {
          const position = confirmedPositions.find((p: any) => p.project?.id === service.project_id)
          return {
            ...service,
            project: position?.project,
            instrument: position?.instrument,
            chair_number: position?.chair_number,
          }
        })
      }
    }
  }

  const dashboardData = {
    musician: {
      id: primaryMusician.id,
      first_name: primaryMusician.first_name,
      last_name: primaryMusician.last_name,
      email: primaryMusician.email,
    },
    organizations: musicians.map((m: any) => ({
      id: m.organization?.id,
      name: m.organization?.name,
      musicianId: m.id,
    })),
    pendingOffers: pendingOffers || [],
    upcomingServices,
  }

  return <DashboardClient initialData={dashboardData} />
}

export default async function MusicianDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ impersonate?: string }>
}) {
  const params = await searchParams
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent impersonateId={params?.impersonate} />
    </Suspense>
  )
}
