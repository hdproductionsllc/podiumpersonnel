import { createServiceClient } from '@/lib/supabase/server'
import type { VenueDetails } from '@/lib/venue-helpers'

export type { VenueDetails }

type ServiceLike = {
  venue_id?: string | null
  venue_id_2?: string | null
  venue_details?: VenueDetails | null
  venue_2_details?: VenueDetails | null
}

// Under the user-session client the `services → venues` embed comes back null
// (the venues RLS policy denies org admins — see scripts/venue-policies-2026-09-17.sql).
// Look the venues up with the service role and attach in code so every page and
// email that shows a venue sees the same record.
export async function attachVenueDetails<T extends ServiceLike>(services: T[]): Promise<T[]> {
  const venueIds = new Set<string>()
  for (const s of services) {
    if (s.venue_id) venueIds.add(s.venue_id)
    if (s.venue_id_2) venueIds.add(s.venue_id_2)
  }
  if (venueIds.size === 0) return services

  const db = createServiceClient()
  const { data: venues } = await db
    .from('venues')
    .select('id, name, address, city, state, zip, google_maps_url, parking_info, directions')
    .in('id', [...venueIds])

  const map = new Map<string, VenueDetails>((venues || []).map((v: VenueDetails & { id: string }) => [v.id, v]))
  for (const s of services) {
    if (s.venue_id) s.venue_details = map.get(s.venue_id) ?? null
    if (s.venue_id_2) s.venue_2_details = map.get(s.venue_id_2) ?? null
  }
  return services
}
