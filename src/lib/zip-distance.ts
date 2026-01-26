/**
 * Haversine formula to calculate distance between two coordinates
 * Returns distance in miles
 */
export function getDistanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3958.8 // Earth's radius in miles
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180)
}

/**
 * Check if a musician is within their service radius of a venue
 */
export async function isWithinServiceArea(
  supabase: any,
  musicianZip: string | null,
  venueZip: string | null,
  radiusMiles: number | null
): Promise<boolean> {
  if (!musicianZip || !venueZip) return true // If no zip, assume they can service
  if (!radiusMiles) radiusMiles = 50 // Default 50 miles

  // Look up coordinates for both zips
  const { data: coords } = await supabase
    .from('zip_coordinates')
    .select('zip, lat, lng')
    .in('zip', [musicianZip, venueZip])

  if (!coords || coords.length < 2) {
    // If we don't have coordinates, fall back to prefix matching
    // Same first 3 digits = roughly same region (~25 mile radius)
    return musicianZip.substring(0, 3) === venueZip.substring(0, 3)
  }

  const musicianCoord = coords.find((c: any) => c.zip === musicianZip)
  const venueCoord = coords.find((c: any) => c.zip === venueZip)

  if (!musicianCoord || !venueCoord) {
    return musicianZip.substring(0, 3) === venueZip.substring(0, 3)
  }

  const distance = getDistanceMiles(
    musicianCoord.lat,
    musicianCoord.lng,
    venueCoord.lat,
    venueCoord.lng
  )

  return distance <= radiusMiles
}

/**
 * Get distance between two zip codes
 */
export async function getZipDistance(
  supabase: any,
  zip1: string,
  zip2: string
): Promise<number | null> {
  const { data: coords } = await supabase
    .from('zip_coordinates')
    .select('zip, lat, lng')
    .in('zip', [zip1, zip2])

  if (!coords || coords.length < 2) return null

  const coord1 = coords.find((c: any) => c.zip === zip1)
  const coord2 = coords.find((c: any) => c.zip === zip2)

  if (!coord1 || !coord2) return null

  return getDistanceMiles(coord1.lat, coord1.lng, coord2.lat, coord2.lng)
}
