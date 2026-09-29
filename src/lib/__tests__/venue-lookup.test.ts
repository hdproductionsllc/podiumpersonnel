import { describe, it, expect } from 'vitest'
import {
  foldVenueName,
  isSameVenueName,
  pickVenueMatch,
  mostCommonState,
  formatPlaceAddress,
  type PlaceCandidate,
} from '@/lib/venue-lookup'

const place = (placeId: string, name: string, address = '1 Main St, Anytown, CA 90000, USA'): PlaceCandidate => ({
  placeId,
  name,
  address,
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

describe('pickVenueMatch', () => {
  it('takes the only place with the name', () => {
    const invisible = place('p1', 'The Invisible House', '8198 Uphill Rd, Joshua Tree, CA 92252, USA')
    expect(pickVenueMatch('Invisible House', [invisible])).toEqual({ match: invisible, reason: 'found' })
  })

  it('ignores places Google returned that are called something else', () => {
    const invisible = place('p1', 'The Invisible House')
    const result = pickVenueMatch('Invisible House', [place('p2', 'Joshua Tree Saloon'), invisible, place('p3', 'Glass Cabin')])
    expect(result).toEqual({ match: invisible, reason: 'found' })
  })

  it('refuses to choose between two places with the same name', () => {
    const result = pickVenueMatch("St. Mary's Church", [place('p1', "St. Mary's Church"), place('p2', 'St Marys Church')])
    expect(result).toEqual({ match: null, reason: 'several' })
  })

  it('prefers the exact name over a longer one that contains it', () => {
    const exact = place('p1', 'Rancho Las Lomas')
    const result = pickVenueMatch('Rancho Las Lomas', [place('p2', 'Rancho Las Lomas Wildlife Foundation'), exact])
    expect(result).toEqual({ match: exact, reason: 'found' })
  })

  it('accepts a longer or shorter name when it is the only one that fits', () => {
    const longer = place('p1', 'Rancho Las Lomas Wildlife Foundation')
    expect(pickVenueMatch('Rancho Las Lomas', [longer, place('p2', 'Silverado Canyon Market')])).toEqual({
      match: longer,
      reason: 'found',
    })
    const shorter = place('p3', 'Missouri Botanical Garden')
    expect(pickVenueMatch('Missouri Botanical Garden, Spink Pavilion', [shorter])).toEqual({
      match: shorter,
      reason: 'found',
    })
  })

  it('refuses when several longer names fit', () => {
    const result = pickVenueMatch('Four Seasons', [
      place('p1', 'Four Seasons Hotel St. Louis'),
      place('p2', 'Four Seasons Resort'),
    ])
    expect(result).toEqual({ match: null, reason: 'several' })
  })

  it('does not match a short name by containment', () => {
    // "Inn" is inside almost every hotel's name.
    expect(pickVenueMatch('Inn', [place('p1', 'Cheshire Inn')])).toEqual({ match: null, reason: 'none' })
  })

  it('counts a place Google listed twice as one place', () => {
    const invisible = place('p1', 'The Invisible House')
    expect(pickVenueMatch('Invisible House', [invisible, { ...invisible }])).toEqual({ match: invisible, reason: 'found' })
  })

  it('reports nothing found', () => {
    expect(pickVenueMatch('Invisible House', [])).toEqual({ match: null, reason: 'none' })
    expect(pickVenueMatch('Invisible House', [place('p1', 'Glass Cabin')])).toEqual({ match: null, reason: 'none' })
    expect(pickVenueMatch('  ', [place('p1', 'Glass Cabin')])).toEqual({ match: null, reason: 'none' })
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
