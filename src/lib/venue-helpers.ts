import type { Service } from '@/types'

/** The venue columns every page and email reads. Attached by attachVenueDetails(). */
export type VenueDetails = {
  name: string
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  google_maps_url: string | null
  parking_info: string | null
  directions: string | null
}

export type ServiceWithVenue = Service & {
  venue_details?: VenueDetails | null
  venue_2_details?: VenueDetails | null
}

/**
 * Get the display name for a venue, preferring the FK-joined venue data
 * over the legacy text field.
 */
export function getVenueDisplay(service: {
  venue?: string | null
  venue_details?: { name: string; address?: string | null; city?: string | null; state?: string | null; zip?: string | null } | null
}): string {
  if (service.venue_details) {
    const v = service.venue_details
    return [v.name, v.address, v.city, v.state, v.zip].filter(Boolean).join(', ')
  }
  return service.venue || ''
}

/**
 * Get just the venue name (without full address), preferring FK data.
 */
export function getVenueName(service: {
  venue?: string | null
  venue_details?: { name: string } | null
}): string {
  return service.venue_details?.name || service.venue || ''
}

/**
 * Get the formatted street address for a venue (without the venue name),
 * e.g. "201 South Skinker Boulevard, St. Louis, MO 63105".
 * Returns null if no address data is available.
 */
export function getVenueAddress(service: {
  venue_details?: {
    address?: string | null
    city?: string | null
    state?: string | null
    zip?: string | null
  } | null
}): string | null {
  const v = service.venue_details
  if (!v) return null
  const cityState = [v.city, v.state].filter(Boolean).join(', ')
  const parts = [v.address, cityState, v.zip].filter(Boolean)
  if (parts.length === 0) return null
  return parts.join(', ')
}

/**
 * Get a Google Maps URL for a venue, using the most precise method available:
 * 1. Stored google_maps_url (usually place_id-based)
 * 2. Full address search
 * Returns null if no reliable location data — never guesses from name alone.
 */
export function getVenueMapsUrl(service: {
  venue?: string | null
  venue_details?: {
    name: string
    address?: string | null
    city?: string | null
    state?: string | null
    zip?: string | null
    google_maps_url?: string | null
  } | null
}): string | null {
  // Prefer stored maps URL (place_id-based)
  if (service.venue_details?.google_maps_url) {
    return service.venue_details.google_maps_url
  }

  // Build address-based URL
  if (service.venue_details) {
    const v = service.venue_details
    const addressParts = [v.address, v.city, v.state, v.zip].filter(Boolean)
    if (addressParts.length > 0) {
      const query = [v.name, ...addressParts].filter(Boolean).join(', ')
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    }
  }

  // No reliable data available — return null rather than a name-only search
  // that could resolve to the wrong location (e.g. wrong "Our Lady of Solitude")
  return null
}

/**
 * The venue fields the gig-details email renders for one service. Both the
 * email builder (src/lib/send-gig-details.ts) and the admin preview dialog call
 * this, so what the admin sees before sending is what the musician receives.
 * A gig with venue text but no linked venue record yields the bare name with no
 * address and no map link — that is what would go out, so that is what we show.
 */
export function formatVenueFields(service: {
  venue?: string | null
  venue_2?: string | null
  venue_details?: VenueDetails | null
  venue_2_details?: VenueDetails | null
}) {
  const venue2 = { venue: service.venue_2, venue_details: service.venue_2_details }
  const hasVenue2 = Boolean(service.venue_2_details || service.venue_2)
  return {
    venue: getVenueName(service) || null,
    venueUrl: getVenueMapsUrl(service),
    venueAddress: getVenueAddress(service),
    parkingInfo: service.venue_details?.parking_info || null,
    directions: service.venue_details?.directions || null,
    venue2: hasVenue2 ? getVenueName(venue2) || null : null,
    venue2Url: hasVenue2 ? getVenueMapsUrl(venue2) : null,
    venue2Address: hasVenue2 ? getVenueAddress(venue2) : null,
    parkingInfo2: service.venue_2_details?.parking_info || null,
    directions2: service.venue_2_details?.directions || null,
  }
}
