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
