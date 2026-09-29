/**
 * Venue lookup: from a venue NAME (all a contract gives) to the one place it means.
 *
 * A wrong address is worse than no address: musicians drive to it. So a match is
 * only ever taken when it is the ONLY place carrying that name. Several places
 * with the name, or none, is reported as such and the admin picks from the venue
 * search instead. Nothing here guesses.
 *
 * Pure functions only: no I/O. The Google call lives in /api/venues/lookup.
 */

/** A place as Google's text search returns it. */
export interface PlaceCandidate {
  placeId: string
  name: string
  /** One line, as Google formats it: "8198 Uphill Rd, Joshua Tree, CA 92252, USA". */
  address: string
}

export type VenueLookupResult =
  | { match: PlaceCandidate; reason: 'found' }
  | { match: null; reason: 'none' | 'several' }

/**
 * A name reduced to what identifies the place: lowercase, letters and digits
 * only, a leading "The" dropped, "&" read as "and". "Invisible House" and "The
 * Invisible House" agree; "St. Mary's" and "St Marys" agree.
 */
export function foldVenueName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/^\s*the\s+/, '')
    .replace(/[^a-z0-9]/g, '')
}

/** Do two names mean the same venue? */
export function isSameVenueName(a: string, b: string): boolean {
  const foldedA = foldVenueName(a)
  return foldedA.length > 0 && foldedA === foldVenueName(b)
}

// A name this short ("Inn", "Bar") is contained in half of everything.
const MIN_CONTAINED_LENGTH = 6

/**
 * Pick the place a venue name means, out of what Google returned for it.
 *
 * A place carrying exactly the name wins. Failing that, a place whose name
 * contains it ("Rancho Las Lomas" -> "Rancho Las Lomas Wildlife Foundation") or
 * is contained in it counts, because contracts shorten and lengthen names. Either
 * way there has to be exactly one; two places that both fit is "several".
 */
export function pickVenueMatch(venueName: string, candidates: PlaceCandidate[]): VenueLookupResult {
  const wanted = foldVenueName(venueName)
  if (!wanted) return { match: null, reason: 'none' }

  // Google can list one place twice; a place is one candidate however often it appears.
  const places = [...new Map(candidates.map((c) => [c.placeId, c])).values()]

  const exact = places.filter((c) => foldVenueName(c.name) === wanted)
  if (exact.length === 1) return { match: exact[0], reason: 'found' }
  if (exact.length > 1) return { match: null, reason: 'several' }

  const close = places.filter((c) => {
    const name = foldVenueName(c.name)
    if (Math.min(name.length, wanted.length) < MIN_CONTAINED_LENGTH) return false
    return name.includes(wanted) || wanted.includes(name)
  })
  if (close.length === 1) return { match: close[0], reason: 'found' }
  return { match: null, reason: close.length > 1 ? 'several' : 'none' }
}

/**
 * The state an org works in, read off the venues it has already saved: the one
 * that appears most. Null when there is nothing to go on. Used to point the
 * search at the right part of the country, never to reject a result.
 */
export function mostCommonState(states: (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>()
  for (const state of states) {
    const key = state?.trim().toUpperCase()
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let best: string | null = null
  for (const [state, count] of counts) {
    if (best === null || count > (counts.get(best) ?? 0)) best = state
  }
  return best
}

/** "8198 Uphill Rd, Joshua Tree, CA 92252, USA" -> "8198 Uphill Rd, Joshua Tree, CA 92252" */
export function formatPlaceAddress(address: string): string {
  return address.replace(/,\s*(?:USA|United States)\s*$/i, '').trim()
}
