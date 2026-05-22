import { createServiceClient } from '@/lib/supabase/server'

export type VenueDetails = {
  name: string
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  google_maps_url: string | null
}

type ServiceLike = {
  venue_id?: string | null
  venue_id_2?: string | null
  venue_details?: VenueDetails | null
  venue_2_details?: VenueDetails | null
}

// PostgREST nested embed `services → venues!services_venue_id_fkey` silently
// returns null under user-session RLS for deeply-nested queries. Look the
// venues up separately with the service role and attach in code.
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
    .select('id, name, address, city, state, zip, google_maps_url')
    .in('id', [...venueIds])

  const map = new Map<string, VenueDetails>((venues || []).map((v: VenueDetails & { id: string }) => [v.id, v]))
  for (const s of services) {
    if (s.venue_id) s.venue_details = map.get(s.venue_id) ?? null
    if (s.venue_id_2) s.venue_2_details = map.get(s.venue_id_2) ?? null
  }
  return services
}
