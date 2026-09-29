/**
 * Venue lookup: from a venue NAME (all a contract gives) to the place it means.
 *
 * A wrong address is worse than no address: musicians drive to it. So a place is
 * only ever chosen when the evidence points at ONE: it is the only place with
 * that name, or the only one with that name in the state the org works in. In
 * every other case the places that fit are handed back and the admin chooses.
 * Whatever is chosen is shown in the form before anything is saved.
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
  | {
      match: PlaceCandidate
      reason: 'found'
      /** Other places with the same name, when the match was chosen by state. */
      others: PlaceCandidate[]
    }
  | {
      match: null
      reason: 'none' | 'several'
      /** Every place that fits the name, for the admin to choose from. */
      others: PlaceCandidate[]
    }

/** The most places ever offered as a choice. */
export const MAX_PLACE_CHOICES = 5

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

/** "8198 Uphill Rd, Joshua Tree, CA 92252, USA" -> "8198 Uphill Rd, Joshua Tree, CA 92252" */
export function formatPlaceAddress(address: string): string {
  return address.replace(/,\s*(?:USA|United States)\s*$/i, '').trim()
}

const US_STATES = new Set(
  'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ')
)

/** "8198 Uphill Rd, Joshua Tree, CA 92252, USA" -> "CA". Null when the address has no US state. */
export function stateOfAddress(address: string): string | null {
  const m = /,\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$/.exec(formatPlaceAddress(address))
  return m && US_STATES.has(m[1]) ? m[1] : null
}

// A name this short ("Inn", "Bar") is contained in half of everything.
const MIN_CONTAINED_LENGTH = 6

const foldAddress = (address: string) => formatPlaceAddress(address).toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * One entry per place. Google lists the same place more than once, under
 * different ids, in three ways seen in real results:
 *  - the same id twice;
 *  - the same street address twice (a studio and its front gate);
 *  - once with its street and once with only the town ("The Invisible House,
 *    8198 Uphill Rd, Joshua Tree, CA 92252" and "The Invisible House, Joshua
 *    Tree, CA 92252"). The fuller one is kept: nobody can drive to a zip code.
 */
function distinctPlaces(candidates: PlaceCandidate[]): PlaceCandidate[] {
  const seenIds = new Set<string>()
  const seenAddresses = new Set<string>()
  const places: PlaceCandidate[] = []
  for (const candidate of candidates) {
    const address = foldAddress(candidate.address)
    if (seenIds.has(candidate.placeId) || (address && seenAddresses.has(address))) continue
    seenIds.add(candidate.placeId)
    if (address) seenAddresses.add(address)
    places.push(candidate)
  }

  return places.filter((place) => {
    const name = foldVenueName(place.name)
    const address = foldAddress(place.address)
    return !places.some((other) => {
      if (other === place || foldVenueName(other.name) !== name) return false
      const fuller = foldAddress(other.address)
      return fuller.length > address.length && fuller.endsWith(address)
    })
  })
}

/**
 * Pick the place a venue name means, out of what Google returned for it.
 *
 * Places carrying exactly the name are considered first. Failing that, places
 * whose name contains it ("Rancho Las Lomas" -> "Rancho Las Lomas Wildlife
 * Foundation") or is contained in it, because contracts shorten and lengthen
 * names. One such place is the match. Several are narrowed to the org's home
 * state; if that does not leave exactly one, nothing is chosen.
 */
export function pickVenueMatch(
  venueName: string,
  candidates: PlaceCandidate[],
  homeState: string | null = null
): VenueLookupResult {
  const wanted = foldVenueName(venueName)
  if (!wanted) return { match: null, reason: 'none', others: [] }

  const places = distinctPlaces(candidates)
  const exact = places.filter((c) => foldVenueName(c.name) === wanted)
  const close = places.filter((c) => {
    const name = foldVenueName(c.name)
    if (Math.min(name.length, wanted.length) < MIN_CONTAINED_LENGTH) return false
    return name.includes(wanted) || wanted.includes(name)
  })
  const fitting = exact.length > 0 ? exact : close

  if (fitting.length === 0) return { match: null, reason: 'none', others: [] }
  if (fitting.length === 1) return { match: fitting[0], reason: 'found', others: [] }

  const home = homeState?.trim().toUpperCase() || null
  const atHome = home ? fitting.filter((c) => stateOfAddress(c.address) === home) : []
  if (atHome.length === 1) {
    const others = fitting.filter((c) => c !== atHome[0]).slice(0, MAX_PLACE_CHOICES - 1)
    return { match: atHome[0], reason: 'found', others }
  }

  // Nothing singles one out. Offer them all, the org's own state first.
  const away = fitting.filter((c) => !atHome.includes(c))
  return { match: null, reason: 'several', others: [...atHome, ...away].slice(0, MAX_PLACE_CHOICES) }
}

/**
 * The state an org works in, read off the venues it has already saved: the one
 * that appears most. Null when there is nothing to go on.
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
