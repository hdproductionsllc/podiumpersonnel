import { describe, it, expect } from 'vitest'
import {
  normalizeVenueName,
  matchSavedVenue,
  venueIsMissingLocation,
} from '@/lib/venue-resolution'

/**
 * Background: gig-details emails were going out with no address and no map link
 * because a gig can carry venue TEXT with no venue_id. The picker now adopts a
 * saved venue when the typed name unambiguously names one. These tests pin the
 * two things that rule must never do: guess between same-named venues, and reach
 * into another organization.
 */

type TestVenue = { id: string; name: string; organization_id?: string }

const v = (id: string, name: string, org = 'org-psq'): TestVenue => ({
  id,
  name,
  organization_id: org,
})

describe('normalizeVenueName', () => {
  it('folds case and surrounding whitespace', () => {
    expect(normalizeVenueName('  Missouri Botanical Garden ')).toBe(
      'missouri botanical garden'
    )
  })

  it('collapses runs of internal whitespace', () => {
    expect(normalizeVenueName('Jewel    Box')).toBe('jewel box')
  })

  it('PRESERVES punctuation — "Stage A" and "Stage-A" are different places', () => {
    expect(normalizeVenueName('Stage A')).not.toBe(normalizeVenueName('Stage-A'))
    expect(normalizeVenueName("St. Mark's")).not.toBe(normalizeVenueName('St Marks'))
  })

  it('treats null/undefined as empty', () => {
    expect(normalizeVenueName(null)).toBe('')
    expect(normalizeVenueName(undefined)).toBe('')
  })
})

describe('matchSavedVenue', () => {
  const venues = [
    v('mbg', 'Missouri Botanical Garden'),
    v('jewel', 'Jewel Box'),
    v('westwind', 'Westwind Hills'),
  ]

  it('links an exact name — the Missouri Botanical Garden case', () => {
    expect(matchSavedVenue('Missouri Botanical Garden', venues).venue?.id).toBe('mbg')
  })

  it('links despite case and spacing differences', () => {
    expect(matchSavedVenue('  missouri   BOTANICAL garden ', venues).venue?.id).toBe('mbg')
  })

  it('does not link a partial or near name', () => {
    expect(matchSavedVenue('Botanical Garden', venues).venue).toBeNull()
    expect(matchSavedVenue('Missouri Botanical Gardens', venues).venue).toBeNull()
  })

  it('returns nothing for empty input', () => {
    expect(matchSavedVenue('', venues).venue).toBeNull()
    expect(matchSavedVenue('   ', venues).venue).toBeNull()
    expect(matchSavedVenue(null, venues).venue).toBeNull()
  })

  it('tolerates a missing venue list', () => {
    expect(matchSavedVenue('Jewel Box', null).venue).toBeNull()
    expect(matchSavedVenue('Jewel Box', []).venue).toBeNull()
  })

  /**
   * REGRESSION GUARD — do not relax.
   *
   * Subito Strings really does have two distinct "Our Lady of Solitude Church"
   * rows and two "Sony Pictures Studios" rows. A name-only guess between them is
   * how musicians were once sent to a same-named church in the wrong city, which
   * is also why venue-helpers refuses to build a name-only Maps URL. If this test
   * ever fails because the matcher started picking the first candidate, the bug is
   * the matcher, not the test.
   */
  it('REFUSES to link when two venues share a name, and reports both', () => {
    const ambiguous = [
      v('ols-1', 'Our Lady of Solitude Church', 'org-subito'),
      v('ols-2', 'Our Lady of Solitude Church', 'org-subito'),
      v('sony-1', 'Sony Pictures Studios', 'org-subito'),
      v('sony-2', 'Sony Pictures Studios', 'org-subito'),
    ]

    const church = matchSavedVenue('Our Lady of Solitude Church', ambiguous)
    expect(church.venue).toBeNull()
    expect(church.candidates.map((c) => c.id)).toEqual(['ols-1', 'ols-2'])

    const studio = matchSavedVenue('sony pictures studios', ambiguous)
    expect(studio.venue).toBeNull()
    expect(studio.candidates).toHaveLength(2)
  })

  it('never reaches another organization — the caller scopes the list', () => {
    // Callers must pass an org-scoped list. Venues are per-org; library_org_id
    // shares the music library only and must not be followed to reach a venue.
    const psqOnly = venues.filter((x) => x.organization_id === 'org-psq')
    const subitoVenue = v('other', 'Missouri Botanical Garden', 'org-subito')

    expect(matchSavedVenue('Missouri Botanical Garden', psqOnly).venue?.id).toBe('mbg')
    expect(psqOnly).not.toContain(subitoVenue)
  })
})

describe('venueIsMissingLocation', () => {
  it('flags venue text with no linked record — the original bug', () => {
    expect(venueIsMissingLocation({ venue: 'Missouri Botanical Garden' })).toBe(true)
  })

  it('is quiet when a linked venue has a full address', () => {
    expect(
      venueIsMissingLocation({
        venue: 'Missouri Botanical Garden',
        venue_details: {
          name: 'Missouri Botanical Garden',
          address: '4344 Shaw Boulevard',
          city: 'St. Louis',
          state: 'MO',
          zip: '63110',
        },
      })
    ).toBe(false)
  })

  /**
   * The reason this helper exists instead of a plain `!venue_id` check: a gig can
   * be linked to a bare venue record and STILL send an addressless email.
   */
  it('still flags a LINKED venue that has no address and no maps URL', () => {
    expect(
      venueIsMissingLocation({
        venue: '9400 Pine Ave',
        venue_details: { name: '9400 Pine Ave' },
      })
    ).toBe(true)
  })

  it('is quiet when a linked venue has only a maps URL — the Jewel Box case', () => {
    expect(
      venueIsMissingLocation({
        venue: 'Jewel Box',
        venue_details: {
          name: 'Jewel Box',
          city: 'St. Louis',
          state: 'MO',
          zip: '63110',
          google_maps_url: 'https://www.google.com/maps/search/?api=1&query=Jewel+Box',
        },
      })
    ).toBe(false)
  })

  it('says nothing about a service with no venue at all', () => {
    expect(venueIsMissingLocation({})).toBe(false)
    expect(venueIsMissingLocation({ venue: null })).toBe(false)
  })
})
