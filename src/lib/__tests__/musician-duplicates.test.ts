import { describe, it, expect } from 'vitest'
import {
  normalizeEmail,
  normalizePhone,
  normalizeName,
  findPossibleDuplicates,
  type MusicianRosterEntry,
} from '@/lib/musicians/duplicates'

/**
 * `findPossibleDuplicates` only ever sees the roster array a caller hands it —
 * it never knows about organization_id and never filters by it. Cross-org
 * duplicates are by design in this app, so every test roster here implicitly
 * stands in for "one organization's musicians"; callers are the ones who must
 * pass a single org's roster.
 */

function musician(overrides: Partial<MusicianRosterEntry> & { id: string }): MusicianRosterEntry {
  return {
    first_name: '',
    last_name: '',
    email: null,
    phone: null,
    ...overrides,
  }
}

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Jane@Example.com  ')).toBe('jane@example.com')
  })

  it('treats blank/whitespace-only as null', () => {
    expect(normalizeEmail('')).toBeNull()
    expect(normalizeEmail('   ')).toBeNull()
  })

  it('treats missing as null', () => {
    expect(normalizeEmail(null)).toBeNull()
    expect(normalizeEmail(undefined)).toBeNull()
  })
})

describe('normalizePhone', () => {
  it('extracts digits and keeps the last 10', () => {
    expect(normalizePhone('(314) 555-1234')).toBe('3145551234')
  })

  it('drops a leading country code', () => {
    expect(normalizePhone('+1 314.555.1234')).toBe('3145551234')
  })

  it('matches regardless of formatting between two representations', () => {
    expect(normalizePhone('(314) 555-1234')).toBe(normalizePhone('+1 314.555.1234'))
  })

  it('treats fewer than 7 digits as unusable (null)', () => {
    expect(normalizePhone('12345')).toBeNull()
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
  })
})

describe('normalizeName', () => {
  it('lowercases and joins first + last', () => {
    expect(normalizeName('Jane', 'Smith')).toBe('jane smith')
  })

  it('folds accents and punctuation so equivalent names match', () => {
    expect(normalizeName('José', "O'Brien")).toBe(normalizeName('jose', 'obrien'))
  })

  it('collapses extra whitespace', () => {
    expect(normalizeName('  Jane  ', '  Smith  ')).toBe('jane smith')
  })
})

describe('findPossibleDuplicates', () => {
  it('matches on email regardless of case/whitespace', () => {
    const roster = [musician({ id: '1', first_name: 'Jane', last_name: 'Smith', email: 'jane@x.com' })]
    const result = findPossibleDuplicates(
      { first_name: 'Janey', last_name: 'Smyth', email: '  JANE@X.COM  ' },
      roster
    )
    expect(result).toHaveLength(1)
    expect(result[0].musician.id).toBe('1')
    expect(result[0].reasons).toEqual(['email'])
  })

  it('matches on phone across common formats', () => {
    const roster = [musician({ id: '1', first_name: 'Jane', last_name: 'Smith', phone: '(314) 555-1234' })]
    const result = findPossibleDuplicates(
      { first_name: 'Different', last_name: 'Name', phone: '+1 314.555.1234' },
      roster
    )
    expect(result).toHaveLength(1)
    expect(result[0].reasons).toEqual(['phone'])
  })

  it('does not match on a too-short phone number', () => {
    const roster = [musician({ id: '1', first_name: 'Jane', last_name: 'Smith', phone: '12345' })]
    const result = findPossibleDuplicates(
      { first_name: 'Jane', last_name: 'Smith', phone: '12345' },
      roster
    )
    // Name still matches, but phone must not contribute a reason.
    expect(result[0].reasons).not.toContain('phone')
  })

  it('matches on accented/punctuated name variants', () => {
    const roster = [musician({ id: '1', first_name: 'José', last_name: "O'Brien" })]
    const result = findPossibleDuplicates(
      { first_name: 'jose', last_name: 'obrien' },
      roster
    )
    expect(result).toHaveLength(1)
    expect(result[0].reasons).toEqual(['name'])
  })

  it('excludes the given id, so editing a record does not match itself', () => {
    const roster = [
      musician({ id: 'self', first_name: 'Jane', last_name: 'Smith', email: 'jane@x.com' }),
      musician({ id: 'other', first_name: 'Jane', last_name: 'Smith', email: 'jane2@x.com' }),
    ]
    const result = findPossibleDuplicates(
      { first_name: 'Jane', last_name: 'Smith', email: 'jane@x.com' },
      roster,
      { excludeId: 'self' }
    )
    expect(result).toHaveLength(1)
    expect(result[0].musician.id).toBe('other')
    expect(result[0].reasons).toEqual(['name'])
  })

  it('still catches an edit that collides with a DIFFERENT person\'s email', () => {
    const roster = [
      musician({ id: 'self', first_name: 'Jane', last_name: 'Smith', email: 'jane@x.com' }),
      musician({ id: 'other', first_name: 'Bob', last_name: 'Jones', email: 'bob@x.com' }),
    ]
    // Jane's record is being edited to use Bob's email.
    const result = findPossibleDuplicates(
      { first_name: 'Jane', last_name: 'Smith', email: 'bob@x.com' },
      roster,
      { excludeId: 'self' }
    )
    expect(result).toHaveLength(1)
    expect(result[0].musician.id).toBe('other')
    expect(result[0].reasons).toEqual(['email'])
  })

  it('orders matches strongest reason first: email > phone > name', () => {
    const roster = [
      musician({ id: 'name-only', first_name: 'Jane', last_name: 'Smith' }),
      musician({ id: 'phone-match', first_name: 'Someone', last_name: 'Else', phone: '3145551234' }),
      musician({ id: 'email-match', first_name: 'Nobody', last_name: 'Here', email: 'jane@x.com' }),
    ]
    const result = findPossibleDuplicates(
      { first_name: 'Jane', last_name: 'Smith', email: 'jane@x.com', phone: '3145551234' },
      roster
    )
    expect(result.map((r) => r.musician.id)).toEqual(['email-match', 'phone-match', 'name-only'])
  })

  it('never matches two musicians with no email/phone on those fields alone', () => {
    const roster = [musician({ id: '1', first_name: 'Totally', last_name: 'Different' })]
    const result = findPossibleDuplicates(
      { first_name: 'Someone', last_name: 'Else' },
      roster
    )
    expect(result).toHaveLength(0)
  })

  it('returns nothing for an empty roster', () => {
    expect(findPossibleDuplicates({ first_name: 'Jane', last_name: 'Smith' }, [])).toEqual([])
  })

  it('is up to the caller to scope the roster to one organization — this function does not know about org_id', () => {
    // Same email, different "organizations" in spirit — this module has no
    // organization_id field at all, so it will report a match. Callers must
    // only ever pass a single org's roster in.
    const roster = [musician({ id: 'org-b-musician', first_name: 'Jane', last_name: 'Smith', email: 'jane@x.com' })]
    const result = findPossibleDuplicates({ first_name: 'Jane', last_name: 'Smith', email: 'jane@x.com' }, roster)
    expect(result).toHaveLength(1)
  })
})
