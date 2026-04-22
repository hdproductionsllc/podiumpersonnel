import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { getVenueMapsUrl, getVenueName, getVenueAddress } from '../venue-helpers'
import { ContractOfferEmail } from '../email/templates/contract-offer'

/**
 * Regression suite for venue Google Maps links in musician-facing emails.
 *
 * Background: A contract offer was sent with a name-only Maps URL
 * (https://www.google.com/maps/search/?api=1&query=Memorial%20Presbyterian%20Church)
 * even though the stored venue had a full place_id URL. Name-only URLs can resolve
 * to the wrong location (e.g. a different "Memorial Presbyterian Church" in another city),
 * so we eliminated every name-only fallback. When a precise URL can't be built,
 * we render plain text instead of a misleading link.
 */

const FULL_STORED_URL =
  'https://www.google.com/maps/search/?api=1&query=Memorial%20Presbyterian%20Church%2C%20201%20South%20Skinker%20Boulevard%2C%20St.%20Louis%2C%20MO%2C%2063105&query_place_id=ChIJZ2uA6qjK2IcR78ZHhI1ImdU'

describe('getVenueMapsUrl', () => {
  it('returns the stored place_id URL verbatim when available', () => {
    const url = getVenueMapsUrl({
      venue: 'Memorial Presbyterian Church',
      venue_details: {
        name: 'Memorial Presbyterian Church',
        address: '201 South Skinker Boulevard',
        city: 'St. Louis',
        state: 'MO',
        zip: '63105',
        google_maps_url: FULL_STORED_URL,
      },
    })
    expect(url).toBe(FULL_STORED_URL)
  })

  it('builds an address-based URL when only address data exists (no stored URL)', () => {
    const url = getVenueMapsUrl({
      venue: 'Some Church',
      venue_details: {
        name: 'Some Church',
        address: '123 Main St',
        city: 'Portland',
        state: 'OR',
        zip: '97201',
        google_maps_url: null,
      },
    })
    expect(url).toContain('maps/search/?api=1&query=')
    expect(url).toContain(encodeURIComponent('Some Church'))
    expect(url).toContain(encodeURIComponent('123 Main St'))
    expect(url).toContain(encodeURIComponent('Portland'))
    expect(url).toContain(encodeURIComponent('97201'))
  })

  it('returns null when there is no venue_details (legacy text-only venue)', () => {
    const url = getVenueMapsUrl({
      venue: 'Our Lady of Solitude', // ambiguous name — multiple cities have one
      venue_details: null,
    })
    expect(url).toBeNull()
  })

  it('returns null when venue_details has only a name (no address, no stored URL)', () => {
    const url = getVenueMapsUrl({
      venue: null,
      venue_details: {
        name: 'Memorial Presbyterian Church',
        address: null,
        city: null,
        state: null,
        zip: null,
        google_maps_url: null,
      },
    })
    expect(url).toBeNull()
  })

  it('returns null when neither venue nor venue_details is present', () => {
    const url = getVenueMapsUrl({ venue: null, venue_details: null })
    expect(url).toBeNull()
  })
})

describe('getVenueAddress', () => {
  it('returns full address line when all fields present', () => {
    expect(
      getVenueAddress({
        venue_details: {
          address: '201 South Skinker Boulevard',
          city: 'St. Louis',
          state: 'MO',
          zip: '63105',
        },
      })
    ).toBe('201 South Skinker Boulevard, St. Louis, MO, 63105')
  })

  it('omits missing parts cleanly (no trailing commas)', () => {
    expect(
      getVenueAddress({
        venue_details: {
          address: '123 Main St',
          city: 'Portland',
          state: null,
          zip: null,
        },
      })
    ).toBe('123 Main St, Portland')
  })

  it('returns null when no address data exists', () => {
    expect(
      getVenueAddress({
        venue_details: {
          address: null,
          city: null,
          state: null,
          zip: null,
        },
      })
    ).toBeNull()
  })

  it('returns null when venue_details is missing entirely', () => {
    expect(getVenueAddress({ venue_details: null })).toBeNull()
  })
})

describe('getVenueName', () => {
  it('prefers FK-joined venue name over legacy text', () => {
    expect(
      getVenueName({
        venue: 'old text',
        venue_details: { name: 'New Venue Name' },
      })
    ).toBe('New Venue Name')
  })

  it('falls back to legacy text when no FK data', () => {
    expect(getVenueName({ venue: 'Legacy Venue', venue_details: null })).toBe(
      'Legacy Venue'
    )
  })

  it('returns empty string when nothing is set', () => {
    expect(getVenueName({ venue: null, venue_details: null })).toBe('')
  })
})

// -----------------------------------------------------------------------------
// End-to-end email rendering — these assertions are what actually ships to the
// musician's inbox. Each scenario is a real-world data shape we see in prod.
// -----------------------------------------------------------------------------

const baseOfferProps = {
  musicianName: 'Shannon Merciel',
  organizationName: 'Project String Quartet',
  projectName: 'Smith Wedding (Jacob & Darian)',
  instrument: 'Cello',
  chairNumber: 1,
  totalChairs: 1,
  responseUrl: 'https://example.com/gig/token',
  expiresAt: null,
  timezone: 'America/Chicago',
  payAmount: 250,
  leaderFee: null,
  isLeader: false,
}

const baseService = {
  name: 'Smith Wedding Ceremony',
  date: 'Saturday, June 20, 2026',
  callTime: '2:30 PM',
  time: '3:00 PM',
  endTime: '4:30 PM',
}

describe('ContractOfferEmail rendering — venue link scenarios', () => {
  it('Scenario 1: venue with stored place_id URL → renders clickable link to the full URL', async () => {
    const html = await render(
      ContractOfferEmail({
        ...baseOfferProps,
        services: [
          {
            ...baseService,
            venue: 'Memorial Presbyterian Church',
            venueUrl: FULL_STORED_URL,
            venueAddress: '201 South Skinker Boulevard, St. Louis, MO, 63105',
          },
        ],
      })
    )
    // Link present with the full URL (HTML escapes & as &amp;)
    expect(html).toContain(FULL_STORED_URL.replace(/&/g, '&amp;'))
    expect(html).toContain('query_place_id=ChIJZ2uA6qjK2IcR78ZHhI1ImdU')
    expect(html).toContain('Memorial Presbyterian Church')
    // Venue name appears inside an anchor tag
    expect(html).toMatch(/<a[^>]*href="[^"]*query_place_id[^"]*"[^>]*>\s*Memorial Presbyterian Church\s*<\/a>/)
    // Address shown as separate text line (readable without clicking)
    expect(html).toContain('201 South Skinker Boulevard, St. Louis, MO, 63105')
  })

  it('venueAddress is rendered as plain text, not inside the link', async () => {
    const html = await render(
      ContractOfferEmail({
        ...baseOfferProps,
        services: [
          {
            ...baseService,
            venue: 'Memorial Presbyterian Church',
            venueUrl: FULL_STORED_URL,
            venueAddress: '201 South Skinker Boulevard, St. Louis, MO, 63105',
          },
        ],
      })
    )
    // Link text is just the venue name (address is NOT inside the anchor)
    expect(html).toMatch(
      /<a[^>]*href="[^"]*query_place_id[^"]*"[^>]*>\s*Memorial Presbyterian Church\s*<\/a>/
    )
    // Address appears outside any anchor tag
    const anchorMatches = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) || []
    const addressInAnchor = anchorMatches.some((a) =>
      a.includes('201 South Skinker Boulevard')
    )
    expect(addressInAnchor).toBe(false)
  })

  it('Scenario 1b: venueAddress omitted → link only, no address line, no crash', async () => {
    const html = await render(
      ContractOfferEmail({
        ...baseOfferProps,
        services: [
          {
            ...baseService,
            venue: 'Memorial Presbyterian Church',
            venueUrl: FULL_STORED_URL,
            // venueAddress undefined
          },
        ],
      })
    )
    expect(html).toContain('Memorial Presbyterian Church')
    expect(html).toContain('query_place_id=ChIJZ2uA6qjK2IcR78ZHhI1ImdU')
  })

  it('Scenario 2: venue with address-based URL → renders clickable link with address', async () => {
    const addressUrl =
      'https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent('Some Church, 123 Main St, Portland, OR, 97201')
    const html = await render(
      ContractOfferEmail({
        ...baseOfferProps,
        services: [
          {
            ...baseService,
            venue: 'Some Church',
            venueUrl: addressUrl,
          },
        ],
      })
    )
    expect(html).toContain(encodeURIComponent('123 Main St'))
    expect(html).toMatch(/<a[^>]*href="[^"]*123%20Main%20St[^"]*"[^>]*>\s*Some Church\s*<\/a>/)
  })

  it('Scenario 3: legacy text-only venue (venueUrl=null) → renders plain text, NOT a link', async () => {
    const html = await render(
      ContractOfferEmail({
        ...baseOfferProps,
        services: [
          {
            ...baseService,
            venue: 'Our Lady of Solitude', // ambiguous name
            venueUrl: null,
          },
        ],
      })
    )
    // Venue name IS present (musician still sees it in the email)
    expect(html).toContain('Our Lady of Solitude')
    // But there is NO anchor tag around it — prevents routing to the wrong location
    expect(html).not.toMatch(/<a[^>]*>\s*Our Lady of Solitude\s*<\/a>/)
    // And no name-only Maps URL was injected anywhere
    expect(html).not.toContain(
      'maps/search/?api=1&amp;query=Our%20Lady%20of%20Solitude'
    )
    expect(html).not.toContain('maps/search/?api=1&query=Our%20Lady%20of%20Solitude')
  })

  it('Scenario 4: no venue at all → no venue line rendered (doesn\'t crash, doesn\'t invent one)', async () => {
    const html = await render(
      ContractOfferEmail({
        ...baseOfferProps,
        services: [
          {
            ...baseService,
            venue: null,
            venueUrl: null,
          },
        ],
      })
    )
    // Service block still renders (date, time, etc.)
    expect(html).toContain('Smith Wedding Ceremony')
    expect(html).toContain('3:00 PM')
    // But no Google Maps link anywhere
    expect(html).not.toContain('maps/search')
  })

  it('Regression: never render a name-only maps URL for the Memorial Presbyterian case', async () => {
    // Simulates the exact failure: template receives a full URL from getVenueMapsUrl
    const html = await render(
      ContractOfferEmail({
        ...baseOfferProps,
        services: [
          {
            ...baseService,
            venue: 'Memorial Presbyterian Church',
            venueUrl: FULL_STORED_URL,
          },
        ],
      })
    )
    // Must NOT contain the truncated name-only URL that was in the sent email
    expect(html).not.toContain(
      'maps/search/?api=1&amp;query=Memorial%20Presbyterian%20Church"'
    )
    expect(html).not.toContain(
      'maps/search/?api=1&query=Memorial%20Presbyterian%20Church"'
    )
    // Must contain the full URL with address + place_id
    expect(html).toContain('query_place_id=ChIJZ2uA6qjK2IcR78ZHhI1ImdU')
  })

  it('Regression: if venueUrl is somehow null, do NOT synthesize a name-only URL in the JSX', async () => {
    // This is the defensive guarantee: even if upstream passes null (for whatever reason),
    // the template must not invent a name-only URL like the old fallback did.
    const html = await render(
      ContractOfferEmail({
        ...baseOfferProps,
        services: [
          {
            ...baseService,
            venue: 'Memorial Presbyterian Church',
            venueUrl: null, // null, not the full URL
          },
        ],
      })
    )
    // Venue name shown
    expect(html).toContain('Memorial Presbyterian Church')
    // No name-only URL fabricated
    expect(html).not.toContain('maps/search')
    // No anchor wrapping the venue name
    expect(html).not.toMatch(/<a[^>]*>\s*Memorial Presbyterian Church\s*<\/a>/)
  })
})
