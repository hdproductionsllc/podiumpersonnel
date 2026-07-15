import { describe, it, expect } from 'vitest'
import { normTitle } from '@/lib/intake/normalize'

/**
 * Parity guard: src/lib/intake/normalize.ts must fold titles EXACTLY as the
 * Phase A indexer (scripts/repertoire-index.js) did when it wrote
 * repertoire.norm_title / title_aliases.alias_norm. The indexer is a run-on-
 * import CommonJS script (throws when the library folder is absent), so it can't
 * be required for a live reference; instead we pin the expected outputs the
 * indexer's normTitle produces, verified against its exact logic.
 */
describe('normTitle — indexer parity', () => {
  const cases: Array<[string, string]> = [
    // curly apostrophe → dropped entirely, "Cant" == "Can't"
    ['Can’t Stop', 'cant stop'],
    ["Can't Stop", 'cant stop'],
    ['Cant Stop', 'cant stop'],
    // curly double quotes folded, then punctuation collapsed
    ['“Canon in D”', 'canon in d'],
    // en/em dash → hyphen → collapsed to space
    ['Air – Bach', 'air bach'],
    ['Air — Bach', 'air bach'],
    // ensemble words stripped
    ['Canon in D String Quartet', 'canon in d'],
    ['Ave Maria Trio', 'ave maria'],
    ['Something Quintet', 'something'],
    // "(1)" copy suffix removed
    ['Clair de Lune (1)', 'clair de lune'],
    // year stripped
    ['God Only Knows 2021', 'god only knows'],
    // version noise stripped (updated/version/copy/month tokens)
    ['God Only Knows Updated', 'god only knows'],
    ['Song Name v2', 'song name'],
    ['Theme Version', 'theme'],
    // accents are NOT letters in [a-z]; they collapse to spaces (indexer behaviour)
    ['Clément', 'cl ment'],
    ['Façade', 'fa ade'],
    // punctuation collapsed, whitespace trimmed
    ['  Multiple   Spaces  ', 'multiple spaces'],
    ['Rock & Roll', 'rock roll'],
    // modifier apostrophe U+02BC folded then dropped
    ['Hawaiʼi', 'hawaii'],
    // straight apostrophe dropped
    ["Don't Stop Believin'", 'dont stop believin'],
    // leftover Naughtin numbering "-01"
    ['Arioso-01', 'arioso'],
  ]

  it.each(cases)('normTitle(%j) === %j', (input, expected) => {
    expect(normTitle(input)).toBe(expected)
  })

  it('is idempotent (normalizing a normalized string is a no-op)', () => {
    for (const [input] of cases) {
      const once = normTitle(input)
      expect(normTitle(once)).toBe(once)
    }
  })

  it('folds curly and straight apostrophe titles to the same key', () => {
    expect(normTitle('Can’t Help Falling in Love')).toBe(
      normTitle("Can't Help Falling in Love")
    )
  })

  it('returns empty string for punctuation/whitespace-only input', () => {
    expect(normTitle('   ')).toBe('')
    expect(normTitle('---')).toBe('')
    expect(normTitle('()')).toBe('')
  })
})
