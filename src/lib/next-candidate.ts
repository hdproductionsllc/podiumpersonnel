import { SupabaseClient } from '@supabase/supabase-js'
import { isWithinServiceArea } from '@/lib/zip-distance'

export interface Candidate {
  id: string
  first_name: string
  last_name: string
  email: string
  call_order: number | null
  is_leader: boolean
  has_conflict: boolean
}

/**
 * Find next available candidates for a position, sorted by call order.
 * Filters out musicians who already have offers, checks service area and conflicts.
 */
export async function getNextCandidates(
  supabase: SupabaseClient,
  positionId: string,
  limit?: number
): Promise<{ candidates: Candidate[]; totalAvailable: number }> {
  // Fetch position with instrument and project info
  const { data: position, error: posError } = await supabase
    .from('project_positions')
    .select(`
      id,
      instrument_id,
      chair_number,
      project:projects!inner(
        id,
        organization_id,
        services(
          id,
          venue_id,
          venue:venues(zip)
        )
      )
    `)
    .eq('id', positionId)
    .single()

  if (posError || !position) {
    return { candidates: [], totalAvailable: 0 }
  }

  const project = position.project as any
  const organizationId = project.organization_id

  // Get venue zip from first service with a venue
  let venueZip: string | null = null
  for (const service of (project.services || [])) {
    if (service.venue?.zip) {
      venueZip = service.venue.zip
      break
    }
  }

  // Get all musicians who have been offered this position (to exclude)
  const { data: existingOffers } = await supabase
    .from('contract_offers')
    .select('musician_id')
    .eq('project_position_id', positionId)

  const offeredMusicianIds = (existingOffers || []).map(o => o.musician_id)

  // Get musicians who play this instrument, sorted by call_order
  const { data: musicians, error: musError } = await supabase
    .from('musicians')
    .select(`
      id,
      first_name,
      last_name,
      email,
      zip_code,
      service_radius_miles,
      call_order,
      is_leader,
      musician_instruments!inner(instrument_id),
      competing_schedules(id, title, start_time, end_time)
    `)
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .eq('musician_instruments.instrument_id', position.instrument_id)
    .order('call_order', { ascending: true })

  if (musError) {
    return { candidates: [], totalAvailable: 0 }
  }

  // Get services to check for conflicts
  const { data: services } = await supabase
    .from('services')
    .select('id, start_time, end_time')
    .eq('project_id', project.id)

  // Filter and sort candidates
  const isLeaderPosition = position.chair_number === 1
  const candidates: Candidate[] = []

  for (const musician of (musicians || [])) {
    // Skip if already offered
    if (offeredMusicianIds.includes(musician.id)) continue

    // Check service area
    const inArea = await isWithinServiceArea(
      supabase,
      musician.zip_code,
      venueZip,
      musician.service_radius_miles
    )
    if (!inArea) continue

    // Check for scheduling conflicts
    const hasConflict = (musician.competing_schedules || []).some((sched: any) => {
      const schedStart = new Date(sched.start_time).getTime()
      const schedEnd = new Date(sched.end_time).getTime()
      return (services || []).some((svc: any) => {
        const svcStart = new Date(svc.start_time).getTime()
        const svcEnd = svc.end_time
          ? new Date(svc.end_time).getTime()
          : svcStart + 3 * 60 * 60 * 1000
        return schedStart < svcEnd && schedEnd > svcStart
      })
    })

    candidates.push({
      id: musician.id,
      first_name: musician.first_name,
      last_name: musician.last_name,
      email: musician.email,
      call_order: musician.call_order,
      is_leader: musician.is_leader,
      has_conflict: hasConflict,
    })
  }

  // Sort: leaders first for chair 1, then by call_order, conflicts last
  candidates.sort((a, b) => {
    // Move conflicts to the end
    if (a.has_conflict && !b.has_conflict) return 1
    if (!a.has_conflict && b.has_conflict) return -1

    // For chair 1, prioritize leaders
    if (isLeaderPosition) {
      if (a.is_leader && !b.is_leader) return -1
      if (!a.is_leader && b.is_leader) return 1
    }

    // Then by call order
    return (a.call_order ?? 100) - (b.call_order ?? 100)
  })

  const totalAvailable = candidates.filter(c => !c.has_conflict).length

  return {
    candidates: limit ? candidates.slice(0, limit) : candidates,
    totalAvailable,
  }
}
