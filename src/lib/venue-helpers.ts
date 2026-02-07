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
