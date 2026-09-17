import type { Venue } from '@/types'
import { getVenueAddress, getVenueMapsUrl } from '@/lib/venue-helpers'
import { matchSavedVenue, normalizeVenueName } from '@/lib/venue-match'

export { matchSavedVenue, normalizeVenueName }

/** Address details resolved from Google Places when an admin picks a suggestion. */
export interface GooglePlaceData {
  placeId: string
  name: string
  address: string
  city: string
  state: string
  zip: string
  googleMapsUrl: string
}

/**
 * How a piece of typed venue text ended up (or failed to end up) attached to a
 * real venue record.
 *
 *  linked     the admin picked a saved venue outright
 *  matched    the text named exactly one saved venue, so we adopted it
 *  created    a Google Place was picked and saved as a new venue
 *  ambiguous  the text named several saved venues — we refuse to guess
 *  unlinked   nothing safe to link to (e.g. "Private Residence in Ladue")
 *  failed     we tried to create a venue and the request errored
 */
export type VenueResolutionStatus =
  | 'linked'
  | 'matched'
  | 'created'
  | 'ambiguous'
  | 'unlinked'
  | 'failed'

export interface VenueResolution {
  /** Display text to store in `services.venue`. */
  venue: string
  /** FK to store in `services.venue_id`. Null means no record to point at. */
  venueId: string | null
  status: VenueResolutionStatus
  /** Populated on `ambiguous` so the caller can let the admin choose. */
  candidates: Venue[]
  /** Populated on `failed`. */
  error?: string
}

export interface ResolveVenueInput {
  /** What the admin typed or picked. */
  typedName: string
  /** Non-null when a saved venue was explicitly selected. */
  venueId: string | null
  placeId?: string | null
  googlePlaceData?: GooglePlaceData | null
  organizationId: string
  /** The org's saved venues, already loaded by the picker. */
  savedVenues: readonly Venue[]
}

/**
 * The single place that decides how venue text becomes a venue link.
 *
 * Both gig dialogs call this instead of keeping their own copy of the
 * create-a-venue-on-Google-pick logic. The returned `venue` and `venueId` travel
 * together as one value so they cannot drift apart downstream — that drift is the
 * whole reason gig emails were going out with no address.
 */
export async function resolveVenue({
  typedName,
  venueId,
  placeId,
  googlePlaceData,
  organizationId,
  savedVenues,
}: ResolveVenueInput): Promise<VenueResolution> {
  const venue = typedName.trim()

  if (!venue) {
    return { venue: '', venueId: null, status: 'unlinked', candidates: [] }
  }

  // 1. The admin picked a saved venue — nothing to work out.
  if (venueId) {
    return { venue, venueId, status: 'linked', candidates: [] }
  }

  // 2. A Google Place was picked: save it so the address travels with the gig.
  if (googlePlaceData || placeId) {
    try {
      const res = await fetch('/api/venues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          name: googlePlaceData?.name || venue,
          address: googlePlaceData?.address || null,
          city: googlePlaceData?.city || null,
          state: googlePlaceData?.state || null,
          zip: googlePlaceData?.zip || null,
          google_place_id: googlePlaceData?.placeId || placeId,
          google_maps_url: googlePlaceData?.googleMapsUrl || null,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || `Venue save failed (${res.status})`)
      }

      const data = await res.json()
      if (!data?.id) throw new Error('Venue save returned no id')

      return { venue, venueId: data.id, status: 'created', candidates: [] }
    } catch (err) {
      // Deliberately surfaced rather than logged and forgotten: a swallowed
      // failure here is exactly how a gig silently loses its address.
      return {
        venue,
        venueId: null,
        status: 'failed',
        candidates: [],
        error: err instanceof Error ? err.message : 'Could not save this venue',
      }
    }
  }

  // 3. Free text: adopt a saved venue only when exactly one answers to that name.
  const { venue: match, candidates } = matchSavedVenue(venue, savedVenues)
  if (match) {
    return { venue, venueId: match.id, status: 'matched', candidates: [] }
  }
  if (candidates.length > 1) {
    return { venue, venueId: null, status: 'ambiguous', candidates }
  }

  return { venue, venueId: null, status: 'unlinked', candidates: [] }
}

/** The subset of a venue record the email templates actually read. */
export interface VenueLocationDetails {
  name: string
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  google_maps_url?: string | null
}

/**
 * Will musicians actually receive a usable location for this service?
 *
 * Keyed on what the email can render, NOT on `venue_id` being set: a gig can be
 * linked to a venue record that carries no address and no Maps URL, in which case
 * the email is still just a bare name. Four such records exist today. Returns false
 * when no venue is set at all — that is a blank field, not a broken link.
 */
export function venueIsMissingLocation(service: {
  venue?: string | null
  venue_details?: VenueLocationDetails | null
}): boolean {
  if (!service.venue && !service.venue_details) return false
  return getVenueAddress(service) === null && getVenueMapsUrl(service) === null
}
