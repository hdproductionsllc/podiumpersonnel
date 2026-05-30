import { NextResponse } from 'next/server'
import { createClient, resolveMusicianIds } from '@/lib/supabase/server'
import { serverError } from '@/lib/api-helpers'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)

  // Optional filters
  const organizationId = searchParams.get('organization_id')
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')
  const impersonateId = searchParams.get('impersonate')

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Resolve musician IDs (supports admin impersonation)
  const { musicianIds: resolvedIds, error: resolveError } = await resolveMusicianIds(
    supabase, user.id, impersonateId
  )

  if (resolveError || resolvedIds.length === 0) {
    return NextResponse.json({ error: resolveError || 'No musician records found' }, { status: 404 })
  }

  // If organization filter is provided, further filter the musician IDs
  let musicianIds = resolvedIds
  if (organizationId) {
    const { data: filtered } = await supabase
      .from('musicians')
      .select('id')
      .in('id', resolvedIds)
      .eq('organization_id', organizationId)
    musicianIds = filtered?.map((m) => m.id) || []
    if (musicianIds.length === 0) {
      return NextResponse.json({ services: [], organizations: [] })
    }
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

  if (!confirmedPositions || confirmedPositions.length === 0) {
    return NextResponse.json({ services: [], organizations: [] })
  }

  const projectIds = [...new Set(confirmedPositions.map((p: any) => p.project?.id).filter(Boolean))]

  // Build services query
  let servicesQuery = supabase
    .from('services')
    .select(`
      id,
      name,
      service_type,
      start_time,
      end_time,
      venue,
      venue_2,
      venue_id,
      base_pay,
      project_id,
      venue_info:venues!services_venue_id_fkey(id, name, address, city, state, google_maps_url)
    `)
    .in('project_id', projectIds)
    .order('start_time', { ascending: true })

  if (startDate) {
    servicesQuery = servicesQuery.gte('start_time', new Date(startDate).toISOString())
  }

  if (endDate) {
    servicesQuery = servicesQuery.lte('start_time', new Date(endDate).toISOString())
  }

  const { data: services, error } = await servicesQuery

  if (error) {
    return serverError('Failed to load musician services', error)
  }

  // Enrich services with project and position info
  const enrichedServices = (services || []).map((service: any) => {
    const position = confirmedPositions.find((p: any) => p.project?.id === service.project_id)
    return {
      ...service,
      project: position?.project,
      instrument: position?.instrument,
      chair_number: position?.chair_number,
    }
  })

  // Get unique organizations
  const organizations = [...new Map(
    confirmedPositions
      .map((p: any) => p.project?.organization)
      .filter(Boolean)
      .map((org: any) => [org.id, { id: org.id, name: org.name }])
  ).values()]

  return NextResponse.json({
    services: enrichedServices,
    organizations,
  })
}
