import { describe, it, expect } from 'vitest'
import { BOOK_NOTES, assertCompleteBooks, getBookBlockers } from '../intake/book-completeness'
const song = { title: 'Example', noMusic: false, specialRequest: false, files: { vln1: {}, vln2: {}, vc: {} } }
const manifest = { parts: [{ part: 'vln1' }, { part: 'vln2' }, { part: 'vc' }], songs: [song] }
describe('book completeness gate', () => {
  it('preserves the existing publication marker exactly', () => expect(BOOK_NOTES).toBe('Book from confirmed client selections \u2014 playlist first, songs in performance order.'))
  it('accepts complete trio without requiring viola or optional score', () => expect(getBookBlockers(manifest)).toEqual([]))
  it('blocks missing cello with an actionable title and part', () => {
    const m = { ...manifest, songs: [{ ...song, files: { vln1: {}, vln2: {} } }] }
    expect(getBookBlockers(m)[0]).toContain('Example')
    expect(getBookBlockers(m)[0]).toContain('vc')
    expect(() => assertCompleteBooks(m)).toThrow('Books are incomplete')
  })
  it('blocks an unmatched ordinary song', () => expect(getBookBlockers({ ...manifest, songs: [{ ...song, files: {} }] })).toHaveLength(1))
  it('preserves explicit silent and special-request slots', () => {
    expect(getBookBlockers({ ...manifest, songs: [{ ...song, noMusic: true, files: {} }, { ...song, specialRequest: true, files: {} }] })).toEqual([])
  })
  it('checks required parts directly, not a stale missingParts array', () => {
    expect(getBookBlockers({ ...manifest, songs: [{ ...song, files: {} }] })).toHaveLength(1)
  })
})
