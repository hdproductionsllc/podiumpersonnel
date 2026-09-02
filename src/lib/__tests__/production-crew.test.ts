/**
 * The production_crew vertical ("Overhire" demo skin) rides on the same
 * engine as every other vertical. These tests pin what makes it different
 * — its roles, its nouns, its brand — and, just as importantly, that the
 * brand does NOT leak into any other vertical.
 */
import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { VERTICALS, VERTICAL_KEYS, brandFor, DEFAULT_BRAND, resolveVertical, term } from '@/lib/verticals'
import { PRODUCTION_CREW_SEEDS } from '@/lib/verticals/seeds'
import { ContractOfferEmail } from '@/lib/email/templates/contract-offer'

const crew = VERTICALS.production_crew

describe('production_crew vertical', () => {
  it('is registered and picked by key', () => {
    expect(VERTICAL_KEYS).toContain('production_crew')
    expect(resolveVertical('production_crew').key).toBe('production_crew')
  })

  it('seeds the roles a crew coordinator writes on a call', () => {
    const abbreviations = PRODUCTION_CREW_SEEDS.map((s) => s.abbreviation)
    for (const core of ['A1', 'A2', 'L1', 'V1', 'LED', 'Hand', 'Rig', 'SM']) {
      expect(abbreviations, `missing ${core}`).toContain(core)
    }
    expect(crew.skillSeeds).toBe(PRODUCTION_CREW_SEEDS)
  })

  it('speaks in shows, calls, roles and crew', () => {
    expect(term(crew.terms, 'work')).toBe('Show')
    expect(term(crew.terms, 'session')).toBe('Call')
    expect(term(crew.terms, 'skill')).toBe('Role')
    expect(term(crew.terms, 'person')).toBe('Tech')
    expect(crew.terms.person.plural).toBe('Crew')
  })

  it('numbers repeated roles as slots without orchestral titles', () => {
    expect(crew.features.useChairs).toBe(true)
    expect(crew.features.useTitleInference).toBe(false)
    expect(crew.titleRules.getPositionTitle('Stagehand', 3).title).toBe('Slot 3')
    expect(crew.titleRules.checkGroupDrift(null, []).drifted).toBe(false)
  })

  it('hides the books tab: crews are assembled per show, not from saved lists', () => {
    expect(crew.features.showBooksTab).toBe(false)
    expect(crew.nav.map((n) => n.id)).not.toContain('books')
  })
})

describe('brand resolution', () => {
  it('is Overhire for production_crew only', () => {
    expect(brandFor(crew)).toEqual({ name: 'Overhire', url: 'https://overhire.app' })
  })

  it('is Podium for every other vertical, and when there is no vertical at all', () => {
    for (const key of VERTICAL_KEYS) {
      if (key === 'production_crew') continue
      expect(brandFor(VERTICALS[key]), `${key} must stay Podium`).toEqual(DEFAULT_BRAND)
    }
    expect(brandFor(null)).toEqual(DEFAULT_BRAND)
    expect(brandFor(undefined)).toEqual(DEFAULT_BRAND)
    expect(DEFAULT_BRAND.name).toBe('Podium')
  })

  it('the music vertical carries no brand field, so the identity freeze still holds', () => {
    expect(VERTICALS.music_contractor.brand).toBeUndefined()
  })
})

describe('email footer brand (ContractOfferEmail)', () => {
  const baseProps = {
    musicianName: 'Alex Rivera',
    organizationName: 'Test Org',
    projectName: 'Spring Concert',
    instrument: 'Cello',
    chairNumber: 1,
    totalChairs: 2,
    services: [],
    responseUrl: 'https://app.example.com/gig/token123',
    expiresAt: null,
  }

  it('says Podium when no brand prop is given', async () => {
    const html = await render(ContractOfferEmail({ ...baseProps }))
    expect(html).toContain('via')
    expect(html).toContain('Podium')
    expect(html).not.toContain('Overhire')
  })

  it('says Overhire when the production_crew brand is passed', async () => {
    const html = await render(ContractOfferEmail({ ...baseProps, brand: brandFor(crew) }))
    expect(html).toContain('Overhire')
    expect(html).toContain('https://overhire.app')
  })
})
