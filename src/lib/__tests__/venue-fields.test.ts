import { describe, it, expect } from 'vitest'
import { formatVenueFields, type VenueDetails } from '../venue-helpers'

/**
 * formatVenueFields() is the ONE place the gig-details email and the admin's
 * "Send gig details" preview get their venue lines from. These tests pin what
 * a musician receives for a linked gig versus a text-only gig, so the preview
 * can never claim an address the email will not carry (or vice versa).
 *
 * Background (2026-09-17): a gig-details batch went out with only a venue name
 * because the gig held venue text with no venue record linked. The preview had
 * its own copy of the formatting and could not have shown the difference.
 */

const MOBOT: VenueDetails = {
  name: 'Missouri Botanical Garden',
  address: '4344 Shaw Boulevard',
  city: 'St. Louis',
  state: 'MO',
  zip: '63110',
  google_maps_url: 'https://www.google.com/maps/search/?api=1&query=MOBOT&query_place_id=ChIJabc',
  parking_info: 'Use the Shaw Blvd lot',
  directions: null,
}

describe('formatVenueFields', () => {
  it('carries name, street address and map link when the gig is linked to a venue record', () => {
    const fields = formatVenueFields({ venue: 'Missouri Botanical Garden', venue_details: MOBOT })
    expect(fields.venue).toBe('Missouri Botanical Garden')
    expect(fields.venueAddress).toBe('4344 Shaw Boulevard, St. Louis, MO, 63110')
    expect(fields.venueUrl).toBe(MOBOT.google_maps_url)
    expect(fields.parkingInfo).toBe('Use the Shaw Blvd lot')
    expect(fields.venue2).toBeNull()
    expect(fields.venue2Address).toBeNull()
  })

  it('prefers the venue record name over stale text on the gig', () => {
    const fields = formatVenueFields({ venue: 'MOBOT (old name)', venue_details: MOBOT })
    expect(fields.venue).toBe('Missouri Botanical Garden')
  })

  it('yields the bare name with no address and no link when the gig has text but no venue record', () => {
    const fields = formatVenueFields({ venue: 'Whittemore House at Washington University', venue_details: null })
    expect(fields.venue).toBe('Whittemore House at Washington University')
    expect(fields.venueAddress).toBeNull()
    expect(fields.venueUrl).toBeNull()
  })

  it('yields nothing when the gig has no venue at all', () => {
    const fields = formatVenueFields({ venue: null, venue_details: null })
    expect(fields.venue).toBeNull()
    expect(fields.venueAddress).toBeNull()
    expect(fields.venueUrl).toBeNull()
  })

  it('formats a second venue independently of the first', () => {
    const reception: VenueDetails = { ...MOBOT, name: 'Jewel Box', address: null, google_maps_url: null, parking_info: null }
    const fields = formatVenueFields({
      venue: 'Missouri Botanical Garden',
      venue_details: MOBOT,
      venue_2: 'Jewel Box',
      venue_2_details: reception,
    })
    expect(fields.venue2).toBe('Jewel Box')
    // City/state/zip are enough for an address line, and enough for a maps search.
    expect(fields.venue2Address).toBe('St. Louis, MO, 63110')
    expect(fields.venue2Url).toContain('Jewel%20Box')
    expect(fields.parkingInfo2).toBeNull()
  })
})
