/**
 * Structural invariants for every vertical template — keeps future template
 * edits (or new verticals) from violating assumptions the app relies on.
 */
import { describe, it, expect } from 'vitest'
import { VERTICALS, VERTICAL_KEYS, plainTitleRules, term, termCount } from '@/lib/verticals'
import { ALL_INSTRUMENT_SECTIONS } from '@/lib/validations/instruments'
import { ALL_SERVICE_TYPES } from '@/lib/validations/projects'

const templates = Object.values(VERTICALS)

describe('verticals registry invariants', () => {
  it('registry contains exactly the declared keys, each self-consistent', () => {
    expect(Object.keys(VERTICALS).sort()).toEqual([...VERTICAL_KEYS].sort())
    for (const [key, t] of Object.entries(VERTICALS)) {
      expect(t.key).toBe(key)
      expect(t.displayName.length).toBeGreaterThan(0)
      expect(t.description.length).toBeGreaterThan(0)
    }
  })

  it('no term contains consecutive capitals (lowercase derivation must stay safe)', () => {
    for (const t of templates) {
      for (const forms of Object.values(t.terms)) {
        if (!forms) continue
        expect(forms.singular).not.toMatch(/[A-Z]{2}/)
        expect(forms.plural).not.toMatch(/[A-Z]{2}/)
      }
    }
  })

  it('every nav has unique ids, non-empty labels, dashboard first, exactly one emphasized item', () => {
    for (const t of templates) {
      const ids = t.nav.map((n) => n.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(ids[0]).toBe('dashboard')
      for (const item of t.nav) expect(item.label.length).toBeGreaterThan(0)
      expect(t.nav.filter((n) => n.emphasize).map((n) => n.id)).toEqual(['projects'])
    }
  })

  it('books nav visibility matches the showBooksTab flag', () => {
    for (const t of templates) {
      expect(t.nav.some((n) => n.id === 'books')).toBe(t.features.showBooksTab)
    }
  })

  it('title inference implies chairs (orchestral titles need chair numbers)', () => {
    for (const t of templates) {
      if (t.features.useTitleInference) expect(t.features.useChairs).toBe(true)
    }
  })

  it('music verticals seed via SQL RPC; all others ship a non-empty TS taxonomy', () => {
    for (const t of templates) {
      if (t.key === 'music_contractor' || t.key === 'orchestra_band') {
        expect(t.skillSeeds).toBe('sql')
      } else {
        expect(Array.isArray(t.skillSeeds)).toBe(true)
        expect((t.skillSeeds as unknown[]).length).toBeGreaterThan(0)
      }
    }
  })

  it('every seed row passes the instrument validation constraints', () => {
    for (const t of templates) {
      if (t.skillSeeds === 'sql') continue
      const names = new Set<string>()
      for (const seed of t.skillSeeds) {
        expect(names.has(seed.name)).toBe(false)
        names.add(seed.name)
        expect(seed.name.length).toBeGreaterThan(0)
        expect(seed.name.length).toBeLessThanOrEqual(255)
        expect(seed.abbreviation.length).toBeLessThanOrEqual(10)
        expect(ALL_INSTRUMENT_SECTIONS).toContain(seed.section)
        // and it is one of the vertical's own groups, or the skill would be listed nowhere
        expect(t.sections, `${t.key}: ${seed.name}`).toContain(seed.section)
        expect(Number.isInteger(seed.sort_order)).toBe(true)
        expect(seed.sort_order).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('rank-less templates have chairs off, and vice versa', () => {
    for (const t of templates) {
      expect(t.features.useChairs).toBe(t.terms.rank !== null)
    }
  })
  it('session types: known, unique, labelled, and the main session is one of them', () => {
    for (const t of templates) {
      const keys = t.sessionTypes.map((s) => s.key)
      expect(new Set(keys).size, t.key).toBe(keys.length)
      for (const s of t.sessionTypes) {
        expect(ALL_SERVICE_TYPES, t.key).toContain(s.key)
        expect(s.label.length).toBeGreaterThan(0)
        expect(s.workerLabel.length).toBeGreaterThan(0)
      }
      expect(keys, t.key).toContain(t.mainSessionType)
      expect(keys, t.key).toContain('other')
      // The Add session dialog only offers the vertical's own types, its main one among them.
      expect(t.addSessionTypes.length, t.key).toBeGreaterThan(0)
      for (const a of t.addSessionTypes) expect(keys, t.key).toContain(a)
      expect(t.addSessionTypes, t.key).toContain(t.mainSessionType)
    }
  })

  it('sections: known, unique, and always include "other" (where a skill with no section is listed)', () => {
    for (const t of templates) {
      expect(new Set(t.sections).size, t.key).toBe(t.sections.length)
      for (const s of t.sections) expect(ALL_INSTRUMENT_SECTIONS).toContain(s)
      expect(t.sections, t.key).toContain('other')
    }
  })

  it('presets: unique, and a blank project is always one of them when there is a picker', () => {
    for (const t of templates) {
      expect(new Set(t.projectPresets).size, t.key).toBe(t.projectPresets.length)
      if (t.projectPresets.length > 0) expect(t.projectPresets, t.key).toContain('custom')
    }
  })
})

describe('term() helpers', () => {
  const dict = VERTICALS.music_contractor.terms

  it('resolves singular/plural and case variants', () => {
    expect(term(dict, 'person')).toBe('Musician')
    expect(term(dict, 'person', { plural: true })).toBe('Musicians')
    expect(term(dict, 'person', { case: 'lower' })).toBe('musician')
    expect(term(dict, 'groupList', { plural: true, case: 'lower' })).toBe('saved ensembles')
  })

  it('null rank resolves to empty string', () => {
    expect(term(VERTICALS.choir.terms, 'rank')).toBe('')
  })

  it('termCount pluralizes by count', () => {
    expect(termCount(dict, 'person', 1)).toBe('1 musician')
    expect(termCount(dict, 'person', 3)).toBe('3 musicians')
    expect(termCount(dict, 'person', 0)).toBe('0 musicians')
  })
})

describe('plainTitleRules', () => {
  it('with a rank: "Rank N" titles, chair 1 is leadership', () => {
    const rules = plainTitleRules({ singular: 'Chair', plural: 'Chairs' })
    expect(rules.getPositionTitle('Anything', 1)).toEqual({
      title: 'Chair 1',
      shortTitle: '1',
      isLeadership: true,
    })
    expect(rules.getPositionTitle('Anything', 3).isLeadership).toBe(false)
  })

  it('without a rank: empty titles, never leadership', () => {
    const rules = plainTitleRules(null)
    expect(rules.getPositionTitle('Soprano 1', 2)).toEqual({
      title: '',
      shortTitle: '',
      isLeadership: false,
    })
  })

  it('drift detection is always inert', () => {
    const rules = plainTitleRules(null)
    expect(rules.checkGroupDrift('String Quartet', [
      { instrument_name: 'Soprano 1', chair_number: 1 },
    ])).toEqual({ drifted: false, suggestion: null })
    expect(rules.checkGroupDrift(null, [])).toEqual({ drifted: false, suggestion: null })
  })
})
