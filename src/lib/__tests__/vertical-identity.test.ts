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
import { resolveVertical, VERTICALS, DEFAULT_VERTICAL, VERTICAL_KEYS, term, brandFor, productTitleFor, leaderFeeForNewService, mainSessionLabel } from '@/lib/verticals'
import { getPositionTitle } from '@/lib/orchestra-positions'
import { checkEnsembleDrift } from '@/lib/ensemble-detection'
import { gigLead, isViolinOne, type PositionForAfterGig } from '@/lib/after-gig/rules'

const FROZEN_DEFAULT_TERMS = {
  person: { singular: 'Musician', plural: 'Musicians' },
  work: { singular: 'Project', plural: 'Projects' },
  session: { singular: 'Service', plural: 'Services' },
  skill: { singular: 'Instrument', plural: 'Instruments' },
  groupList: { singular: 'Saved Ensemble', plural: 'Saved Ensembles' },
  // Added when the music-distribution emails were generalized. 'Music' is the
  // word those emails already used ("Music available", "your music"), so this
  // entry encodes existing behaviour rather than changing it — the no-op
  // guarantee is preserved, and the assertion below proves the rendered
  // wording is unchanged.
  materials: { singular: 'Music', plural: 'Music' },
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

  it('music-distribution wording is byte-identical to the pre-verticals strings', () => {
    // The generalization must be invisible to a music org. These are the exact
    // phrases the templates and subject lines produced before `materials` existed.
    const t = def.terms
    expect(`${term(t, 'materials')} available for download`).toBe('Music available for download')
    expect(`Your ${term(t, 'materials', { case: 'lower' })} for`).toBe('Your music for')
    expect(`${term(t, 'materials')} available:`).toBe('Music available:')
    expect(`Reminder: download your ${term(t, 'materials', { case: 'lower' })} for`).toBe(
      'Reminder: download your music for'
    )
    expect(`Following up on the ${term(t, 'materials', { case: 'lower' })} for`).toBe(
      'Following up on the music for'
    )
  })

  it('the default person label still reads "Musician" wherever it is substituted', () => {
    // Covers the two former hardcodes: the policy heading and the gig greeting.
    expect(`${term(def.terms, 'person')} Policy`).toBe('Musician Policy')
    expect(term(def.terms, 'person')).toBe('Musician')
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
      // Added with the production_crew vertical (target architecture 5). True
      // is what the app always did: the Leader Fee field and "Add leader fee"
      // shown, new services left to the database's 50 default.
      useLeaderFee: true,
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

/**
 * The lists and rules target architecture section 5 moved into the template.
 * For every vertical that existed before production_crew they are today's
 * literal values, frozen here against inline copies: the service form's Type
 * list, the gig page's "(performance)", the section groups, Violin 1 leading
 * by default, the String Quartet picker, the "<name> Performance" blank gig,
 * the Podium brand. Do not change these without David's sign-off.
 */
const FROZEN_SESSION_TYPES = [
  { key: 'rehearsal', label: 'Rehearsal', workerLabel: 'rehearsal' },
  { key: 'performance', label: 'Performance', workerLabel: 'performance' },
  { key: 'dress_rehearsal', label: 'Dress Rehearsal', workerLabel: 'dress_rehearsal' },
  { key: 'sectional', label: 'Sectional', workerLabel: 'sectional' },
  { key: 'other', label: 'Other', workerLabel: 'other' },
]
const FROZEN_SECTIONS = ['strings', 'woodwinds', 'brass', 'percussion', 'other']
const FROZEN_MUSIC_PRESETS = ['string-quartet', 'string-trio', 'duo', 'solo', 'orchestra', 'custom']

const BEFORE_CREW = VERTICAL_KEYS.filter((k) => k !== 'production_crew')

describe('vertical identity: the section 5 values are unchanged for every vertical before production_crew', () => {
  it.each(BEFORE_CREW)('%s: session types, sections, main session, lead, leader fee and brand are unchanged', (key) => {
    const v = VERTICALS[key]
    expect(v.sessionTypes).toEqual(FROZEN_SESSION_TYPES)
    expect(v.sections).toEqual(FROZEN_SECTIONS)
    expect(v.mainSessionType).toBe('performance')
    expect(mainSessionLabel(v)).toBe('Performance')
    expect(v.leadFallbackSkill?.label).toBe('Violin 1')
    expect(v.leadFallbackSkill?.matches).toBe(isViolinOne)
    expect(v.features.useLeaderFee).toBe(true)
    expect(leaderFeeForNewService(v)).toEqual({})
    expect(v.brand).toBeUndefined()
    expect(brandFor(v).name).toBe('Podium')
    expect(productTitleFor(v)).toBe('Podium Personnel')
  })

  it('the template picker: the music verticals keep their six presets in order, the others still have none', () => {
    expect(VERTICALS.music_contractor.projectPresets).toEqual(FROZEN_MUSIC_PRESETS)
    expect(VERTICALS.orchestra_band.projectPresets).toEqual(FROZEN_MUSIC_PRESETS)
    for (const key of BEFORE_CREW) {
      // The picker used to be shown exactly when title inference was on.
      expect(VERTICALS[key].projectPresets.length > 0, key).toBe(VERTICALS[key].features.useTitleInference)
    }
  })

  it('gigLead with the music template is gigLead with no template at all (Violin 1, lowest chair)', () => {
    const seat = (id: string, instrument: string, chair: number): PositionForAfterGig => ({
      id: `p-${id}`,
      status: 'confirmed',
      musician_id: id,
      chair_number: chair,
      instrument: { name: instrument },
      musician: { id, first_name: id, last_name: 'X', email: `${id}@example.test`, is_leader: id === 'cello' },
    })
    const quartet = [seat('cello', 'Cello', 1), seat('v1b', 'Violin I', 2), seat('v1a', 'Violin 1', 1), seat('v2', 'Violin 2', 1)]
    const fallback = VERTICALS.music_contractor.leadFallbackSkill
    for (const chosen of [null, 'v2', 'nobody']) {
      expect(gigLead(quartet, chosen, fallback)).toEqual(gigLead(quartet, chosen))
    }
    expect(gigLead(quartet, null, fallback)).toMatchObject({ source: 'violin-1', lead: { musicianId: 'v1a' } })
  })
})
