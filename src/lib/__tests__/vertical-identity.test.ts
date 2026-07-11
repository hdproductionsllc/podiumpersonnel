/**
 * THE NO-OP GUARANTEE for live organizations.
 *
 * Every pre-verticals org resolves to the 'music_contractor' template. This
 * suite freezes that template against a SECOND, inline copy of today's exact
 * strings — if anyone "improves" a default label, reorders the default nav,
 * or diverges the default title logic from the original orchestral functions,
 * these tests fail. Do not update the frozen literals without David's
 * explicit sign-off: they ARE the promise that live orgs see zero change.
 */
import { describe, it, expect } from 'vitest'
import { resolveVertical, VERTICALS, DEFAULT_VERTICAL } from '@/lib/verticals'
import { getPositionTitle } from '@/lib/orchestra-positions'
import { checkEnsembleDrift } from '@/lib/ensemble-detection'

const FROZEN_DEFAULT_TERMS = {
  person: { singular: 'Musician', plural: 'Musicians' },
  work: { singular: 'Project', plural: 'Projects' },
  session: { singular: 'Service', plural: 'Services' },
  skill: { singular: 'Instrument', plural: 'Instruments' },
  groupList: { singular: 'Saved Ensemble', plural: 'Saved Ensembles' },
  rank: { singular: 'Chair', plural: 'Chairs' },
}

// Exactly today's sidebar: label + order + emphasis (routes live in NAV_META)
const FROZEN_DEFAULT_NAV = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'projects', label: 'Projects', emphasize: true },
  { id: 'musicians', label: 'Musicians' },
  { id: 'books', label: 'Saved Ensembles' },
  { id: 'payments', label: 'Payments' },
  { id: 'venues', label: 'Venues' },
  { id: 'instruments', label: 'Instruments' },
  { id: 'emails', label: 'Sent Emails' },
]

describe('vertical identity: default template = today, frozen', () => {
  const def = resolveVertical('music_contractor')

  it('default vertical key is music_contractor', () => {
    expect(DEFAULT_VERTICAL).toBe('music_contractor')
  })

  it('terminology matches the frozen pre-verticals labels exactly', () => {
    expect(def.terms).toEqual(FROZEN_DEFAULT_TERMS)
  })

  it('nav matches the frozen pre-verticals sidebar exactly (labels, order, emphasis)', () => {
    expect(def.nav).toEqual(FROZEN_DEFAULT_NAV)
  })

  it('all features on, exactly as pre-verticals behavior', () => {
    expect(def.features).toEqual({
      useChairs: true,
      useTitleInference: true,
      useEnsembleDetection: true,
      showBooksTab: true,
    })
  })

  it('title rules ARE the original orchestral functions (reference equality)', () => {
    expect(def.titleRules.getPositionTitle).toBe(getPositionTitle)
    expect(def.titleRules.checkGroupDrift).toBe(checkEnsembleDrift)
  })

  it('orchestra_band shares the identical orchestral title logic', () => {
    const ob = resolveVertical('orchestra_band')
    expect(ob.titleRules.getPositionTitle).toBe(getPositionTitle)
    expect(ob.titleRules.checkGroupDrift).toBe(checkEnsembleDrift)
  })
})

describe('vertical identity: orchestral title matrix (guards behavior, not just reference)', () => {
  const title = (name: string, chair: number, section?: string | null, total?: number, size?: number) =>
    resolveVertical(null).titleRules.getPositionTitle(name, chair, section, total, size)

  it('Violin 1 orchestra titles', () => {
    expect(title('Violin 1', 1, 'strings', 3, 40).title).toBe('Concertmaster')
    expect(title('Violin 1', 2, 'strings', 3, 40).title).toBe('Assistant Concertmaster')
    expect(title('Violin 1', 3, 'strings', 3, 40).title).toBe('Section')
  })

  it('Violin 1 chamber titles (ensemble <= 8)', () => {
    expect(title('Violin 1', 1, 'strings', 2, 4).title).toBe('1st Violin')
    expect(title('Violin 1', 2, 'strings', 2, 4).title).toBe('2nd Violin')
  })

  it('winds numbered positions', () => {
    expect(title('Flute', 1, 'woodwinds', 2, 40).title).toBe('Principal')
    expect(title('Flute', 2, 'woodwinds', 2, 40).title).toBe('2nd / Assistant Principal')
    expect(title('Trumpet', 3, 'brass', 4, 40).title).toBe('3rd')
    expect(title('Trumpet', 4, 'brass', 4, 40).title).toBe('4th')
  })

  it('percussion and timpani', () => {
    expect(title('Timpani', 1, 'percussion', 2, 40).title).toBe('Principal Timpani')
    expect(title('Percussion', 2, 'percussion', 3, 40).title).toBe('Percussion 2')
  })

  it('single chair in non-chamber context skips orchestral titles', () => {
    expect(title('Violin 1', 1, 'strings', 1, 40).title).toBe('Chair 1')
  })

  it('fallback instrument', () => {
    expect(title('Theremin', 1, null, 2, 40).title).toBe('Principal')
    expect(title('Theremin', 3, null, 3, 40).title).toBe('Chair 3')
  })
})

describe('resolveVertical fail-safe (deploy-order tolerance)', () => {
  it('null, undefined, and unknown keys all resolve to the default template', () => {
    expect(resolveVertical(null)).toBe(VERTICALS.music_contractor)
    expect(resolveVertical(undefined)).toBe(VERTICALS.music_contractor)
    expect(resolveVertical('garbage')).toBe(VERTICALS.music_contractor)
    expect(resolveVertical('')).toBe(VERTICALS.music_contractor)
  })

  it('never throws for hostile input', () => {
    expect(() => resolveVertical('__proto__')).not.toThrow()
    expect(resolveVertical('__proto__').key).toBe('music_contractor')
    expect(resolveVertical('toString').key).toBe('music_contractor')
  })
})
