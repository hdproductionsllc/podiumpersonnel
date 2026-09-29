import { describe, it, expect } from 'vitest'
import {
  foldVenueName,
  isSameVenueName,
  pickVenueMatch,
  mostCommonState,
  formatPlaceAddress,
  stateOfAddress,
  MAX_PLACE_CHOICES,
  type PlaceCandidate,
} from '@/lib/venue-lookup'

let street = 0
/** A place with its own street address unless one is given. */
const place = (placeId: string, name: string, address?: string): PlaceCandidate => ({
  placeId,
  name,
  address: address ?? `${++street} Main St, Anytown, CA 90000, USA`,
})

describe('foldVenueName / isSameVenueName', () => {
  it('treats a leading "The" as noise', () => {
    expect(isSameVenueName('Invisible House', 'The Invisible House')).toBe(true)
  })

  it('ignores case, punctuation and spacing', () => {
    expect(isSameVenueName("St. Mary's Church", 'st marys  church')).toBe(true)
    expect(isSameVenueName('Lyon & Healy Hall', 'Lyon and Healy Hall')).toBe(true)
  })

  it('only drops "The" from the front', () => {
    expect(foldVenueName('House of the Rising Sun')).toBe('houseoftherisingsun')
    expect(foldVenueName('Theatre Royal')).toBe('theatreroyal')
  })

  it('never matches on an empty name', () => {
    expect(isSameVenueName('', '')).toBe(false)
    expect(isSameVenueName('The', ' ')).toBe(false)
  })
})

describe('pickVenueMatch: one place fits', () => {
  it('takes the only place with the name', () => {
    const invisible = place('p1', 'The Invisible House', '8198 Uphill Rd, Joshua Tree, CA 92252, USA')
    expect(pickVenueMatch('Invisible House', [invisible])).toEqual({ match: invisible, reason: 'found', others: [] })
  })

  it('takes it wherever it is, even far from the org', () => {
    // A Missouri org playing a wedding in Joshua Tree: one place has the name, so that is it.
    const invisible = place('p1', 'The Invisible House', '8198 Uphill Rd, Joshua Tree, CA 92252, USA')
    expect(pickVenueMatch('Invisible House', [invisible], 'MO')).toEqual({ match: invisible, reason: 'found', others: [] })
  })

  it('ignores places Google returned that are called something else', () => {
    const invisible = place('p1', 'The Invisible House')
    const result = pickVenueMatch('Invisible House', [place('p2', 'Joshua Tree Saloon'), invisible, place('p3', 'Glass Cabin')])
    expect(result).toEqual({ match: invisible, reason: 'found', others: [] })
  })

  it('prefers the exact name over a longer one that contains it', () => {
    const exact = place('p1', 'Rancho Las Lomas')
    const result = pickVenueMatch('Rancho Las Lomas', [place('p2', 'Rancho Las Lomas Wildlife Foundation'), exact])
    expect(result).toEqual({ match: exact, reason: 'found', others: [] })
  })

  it('accepts a longer or shorter name when it is the only one that fits', () => {
    const longer = place('p1', 'Rancho Las Lomas Wildlife Foundation')
    expect(pickVenueMatch('Rancho Las Lomas', [longer, place('p2', 'Silverado Canyon Market')]).match).toBe(longer)
    const shorter = place('p3', 'Missouri Botanical Garden')
    expect(pickVenueMatch('Missouri Botanical Garden, Spink Pavilion', [shorter]).match).toBe(shorter)
  })

  it('counts a place Google listed twice as one place', () => {
    const invisible = place('p1', 'The Invisible House')
    expect(pickVenueMatch('Invisible House', [invisible, { ...invisible }])).toEqual({
      match: invisible,
      reason: 'found',
      others: [],
    })
  })

  it('counts two listings at one street address as one place', () => {
    // A studio and its front gate: two Google ids, one place to drive to.
    const studio = place('p1', 'Sony Pictures Studios', '10202 Washington Blvd, Culver City, CA 90232, USA')
    const gate = place('p2', 'Sony Pictures Studios', '10202 Washington Blvd, Culver City, CA 90232')
    expect(pickVenueMatch('Sony Pictures Studios', [studio, gate])).toEqual({ match: studio, reason: 'found', others: [] })
  })

  it('counts a listing with no street as the same place as the fuller one, and keeps the fuller', () => {
    // Exactly what the live server got from Google on 2026-09-29.
    const full = place('p1', 'The Invisible House', '8198 Uphill Rd, Joshua Tree, CA 92252, USA')
    const townOnly = place('p2', 'The Invisible House', 'Joshua Tree, CA 92252, USA')
    const found = { match: full, reason: 'found', others: [] }
    expect(pickVenueMatch('Invisible House', [full, townOnly], 'CA')).toEqual(found)
    expect(pickVenueMatch('Invisible House', [townOnly, full], 'MO')).toEqual(found)
    expect(pickVenueMatch('Invisible House', [townOnly, full])).toEqual(found)
  })

  it('keeps a town-only listing when it is the only one', () => {
    const townOnly = place('p2', 'The Invisible House', 'Joshua Tree, CA 92252, USA')
    expect(pickVenueMatch('Invisible House', [townOnly]).match).toBe(townOnly)
  })

  it('does not merge a town-only listing into a place with a different name', () => {
    const chapel = place('p1', 'Desert Chapel', '8198 Uphill Rd, Joshua Tree, CA 92252, USA')
    const house = place('p2', 'The Invisible House', 'Joshua Tree, CA 92252, USA')
    expect(pickVenueMatch('Invisible House', [chapel, house]).match).toBe(house)
  })

  it('does not merge two places in the same town that both have a street', () => {
    const oak = place('p1', "St. Mary's Church", '12 Oak St, St. Louis, MO 63101, USA')
    const elm = place('p2', "St. Mary's Church", '40 Elm St, St. Louis, MO 63101, USA')
    expect(pickVenueMatch("St. Mary's Church", [oak, elm], 'MO').reason).toBe('several')
  })
})

describe('pickVenueMatch: several places fit', () => {
  const joshuaTree = place('p1', 'The Invisible House', '8198 Uphill Rd, Joshua Tree, CA 92252, USA')
  const richmond = place('p2', 'Invisible House', '12 Broad St, Richmond, VA 23219, USA')
  const asheville = place('p3', 'Invisible House', '9 Lexington Ave, Asheville, NC 28801, USA')

  it('takes the only one in the state the org works in, and keeps the rest as alternatives', () => {
    expect(pickVenueMatch('Invisible House', [richmond, joshuaTree, asheville], 'CA')).toEqual({
      match: joshuaTree,
      reason: 'found',
      others: [richmond, asheville],
    })
  })

  it('chooses nothing when none of them is in the org state', () => {
    expect(pickVenueMatch('Invisible House', [richmond, joshuaTree, asheville], 'MO')).toEqual({
      match: null,
      reason: 'several',
      others: [richmond, joshuaTree, asheville],
    })
  })

  it('chooses nothing when the org has no home state', () => {
    const result = pickVenueMatch('Invisible House', [richmond, joshuaTree])
    expect(result).toEqual({ match: null, reason: 'several', others: [richmond, joshuaTree] })
  })

  it('chooses nothing between two in the org state, and lists those first', () => {
    const downtown = place('p4', 'Missouri Athletic Club', '405 Washington Ave, St. Louis, MO 63102, USA')
    const west = place('p5', 'Missouri Athletic Club', '1777 Des Peres Rd, St. Louis, MO 63131, USA')
    const elsewhere = place('p6', 'Missouri Athletic Club', '1 Elm St, Springfield, IL 62701, USA')
    expect(pickVenueMatch('Missouri Athletic Club', [elsewhere, downtown, west], 'MO')).toEqual({
      match: null,
      reason: 'several',
      others: [downtown, west, elsewhere],
    })
  })

  it('refuses when several longer names fit', () => {
    const result = pickVenueMatch('Four Seasons', [
      place('p1', 'Four Seasons Hotel St. Louis'),
      place('p2', 'Four Seasons Resort'),
    ])
    expect(result.match).toBeNull()
    expect(result.reason).toBe('several')
    expect(result.others).toHaveLength(2)
  })

  it('never offers more than a handful of choices', () => {
    const many = Array.from({ length: 12 }, (_, i) => place(`m${i}`, "St. Mary's Church"))
    expect(pickVenueMatch("St. Mary's Church", many).others).toHaveLength(MAX_PLACE_CHOICES)
  })
})

describe('pickVenueMatch: nothing fits', () => {
  it('reports nothing found', () => {
    const none = { match: null, reason: 'none', others: [] }
    expect(pickVenueMatch('Invisible House', [])).toEqual(none)
    expect(pickVenueMatch('Invisible House', [place('p1', 'Glass Cabin')])).toEqual(none)
    expect(pickVenueMatch('  ', [place('p1', 'Glass Cabin')])).toEqual(none)
  })

  it('does not match a short name by containment', () => {
    // "Inn" is inside almost every hotel's name.
    expect(pickVenueMatch('Inn', [place('p1', 'Cheshire Inn')]).reason).toBe('none')
  })
})

describe('stateOfAddress', () => {
  it.each([
    ['8198 Uphill Rd, Joshua Tree, CA 92252, USA', 'CA'],
    ['405 Washington Ave, St. Louis, MO 63102', 'MO'],
    ['1 Main St, Chicago, IL 60601-1234, United States', 'IL'],
    ['Joshua Tree, CA', 'CA'],
  ])('%s -> %s', (address, state) => {
    expect(stateOfAddress(address)).toBe(state)
  })

  it.each(['', 'Joshua Tree', '10 Downing St, London SW1A 2AA, UK'])('finds no state in "%s"', (address) => {
    expect(stateOfAddress(address)).toBeNull()
  })
})

describe('mostCommonState', () => {
  it('picks the state most saved venues are in', () => {
    expect(mostCommonState(['CA', 'CA', 'NV', null, 'ca ', undefined, ''])).toBe('CA')
  })

  it('has no opinion without saved venues', () => {
    expect(mostCommonState([])).toBeNull()
    expect(mostCommonState([null, '', undefined])).toBeNull()
  })
})

describe('formatPlaceAddress', () => {
  it('drops the country', () => {
    expect(formatPlaceAddress('8198 Uphill Rd, Joshua Tree, CA 92252, USA')).toBe('8198 Uphill Rd, Joshua Tree, CA 92252')
    expect(formatPlaceAddress('1 Main St, St. Louis, MO 63101, United States')).toBe('1 Main St, St. Louis, MO 63101')
  })

  it('leaves everything else alone', () => {
    expect(formatPlaceAddress('Joshua Tree, CA')).toBe('Joshua Tree, CA')
  })
})
