import { redirect } from 'next/navigation'
import { createClient, resolveMusicianIds } from '@/lib/supabase/server'
import { ScheduleClient, ScheduleSkeleton } from '@/components/musician/schedule-client'
import { Suspense } from 'react'

async function ScheduleContent({ impersonateId }: { impersonateId?: string }) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/musician/login')
  }

  // Resolve musician IDs (supports admin impersonation)
  const { musicianIds, error: resolveError } = await resolveMusicianIds(
    supabase, user.id, impersonateId
  )

  if (resolveError || musicianIds.length === 0) {
    redirect('/musician/login?error=no_musician_records')
  }

  // Get confirmed positions for these musicians
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

  let services: any[] = []
  let organizations: { id: string; name: string }[] = []

  if (confirmedPositions && confirmedPositions.length > 0) {
    const projectIds = [...new Set(confirmedPositions.map((p: any) => p.project?.id).filter(Boolean))]

    if (projectIds.length > 0) {
      const { data: serviceData } = await supabase
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
          venue_info:venues(id, name, address, city, state, google_maps_url)
        `)
        .in('project_id', projectIds)
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true })

      if (serviceData) {
        // Enrich services with project and position info
        services = serviceData.map((service: any) => {
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

    // Get unique organizations
    organizations = [...new Map(
      confirmedPositions
        .map((p: any) => p.project?.organization)
        .filter(Boolean)
        .map((org: any) => [org.id, { id: org.id, name: org.name }])
    ).values()]
  }

  return (
    <ScheduleClient
      initialServices={services}
      organizations={organizations}
    />
  )
}

export default async function MusicianSchedulePage({
  searchParams,
}: {
  searchParams?: Promise<{ impersonate?: string }>
}) {
  const params = await searchParams
  return (
    <Suspense fallback={<ScheduleSkeleton />}>
      <ScheduleContent impersonateId={params?.impersonate} />
    </Suspense>
  )
}
