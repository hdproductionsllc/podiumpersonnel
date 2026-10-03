/**
 * The production_crew vertical (target architecture section 5, rebased from
 * the overhire-demo-skin branch) rides on the same engine as every other
 * vertical. These tests pin what makes it different (its roles, its words,
 * its lists, its brand, its three-call show) and that the brand and the lists
 * do not leak into any other vertical. The music values themselves are frozen
 * by vertical-identity.test.ts; the four branded emails by
 * brand-emails-identity.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import {
  VERTICALS,
  VERTICAL_KEYS,
  brandFor,
  productTitleFor,
  DEFAULT_BRAND,
  resolveVertical,
  term,
  threeCallShowServices,
  leaderFeeForNewService,
  mainSessionLabel,
} from '@/lib/verticals'
import { PRODUCTION_CREW_SEEDS } from '@/lib/verticals/seeds'
import { ContractOfferEmail } from '@/lib/email/templates/contract-offer'
import { PODIUM_FOOTER_URL } from '@/lib/email/templates/podium-footer'
import { gigLead, type PositionForAfterGig } from '@/lib/after-gig/rules'
import { serviceSchema } from '@/lib/validations/projects'
import { instrumentSchema } from '@/lib/validations/instruments'

const crew = VERTICALS.production_crew

describe('production_crew vertical', () => {
  it('is registered and picked by key', () => {
    expect(VERTICAL_KEYS).toContain('production_crew')
    expect(resolveVertical('production_crew').key).toBe('production_crew')
  })

  it('seeds the roles a crew coordinator writes on a call, each in its department', () => {
    const byAbbr = Object.fromEntries(PRODUCTION_CREW_SEEDS.map((s) => [s.abbreviation, s.section]))
    expect(byAbbr).toMatchObject({ A1: 'audio', A2: 'audio', L1: 'lighting', V1: 'video', LED: 'video', Rig: 'rigging', Hand: 'labor', SM: 'management' })
    expect(crew.skillSeeds).toBe(PRODUCTION_CREW_SEEDS)
    for (const seed of PRODUCTION_CREW_SEEDS) {
      expect(instrumentSchema.safeParse({ ...seed }).success, seed.name).toBe(true)
    }
  })

  it('speaks in shows, calls, roles and crew', () => {
    expect(term(crew.terms, 'work')).toBe('Show')
    expect(term(crew.terms, 'session')).toBe('Call')
    expect(term(crew.terms, 'skill')).toBe('Role')
    expect(term(crew.terms, 'person')).toBe('Tech')
    expect(crew.terms.person.plural).toBe('Crew')
    expect(`${term(crew.terms, 'person')} Policy`).toBe('Tech Policy')
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

describe('section 5 values for a crew', () => {
  it('has no leader fee: the field is hidden and a new service says 0, never the old $50 default', () => {
    expect(crew.features.useLeaderFee).toBe(false)
    expect(leaderFeeForNewService(crew)).toEqual({ leader_fee: 0 })
  })

  it('call types: load-in, rehearsal, show, breakout, strike, other; the show call is the main one', () => {
    expect(crew.sessionTypes.map((t) => t.key)).toEqual(['load_in', 'rehearsal', 'show_call', 'breakout', 'strike', 'other'])
    expect(crew.sessionTypes.map((t) => t.label)).toEqual(['Load-in', 'Rehearsal', 'Show', 'Breakout', 'Strike', 'Other'])
    expect(crew.sessionTypes.find((t) => t.key === 'load_in')?.workerLabel).toBe('load-in')
    expect(crew.mainSessionType).toBe('show_call')
    expect(mainSessionLabel(crew)).toBe('Show')
    for (const t of crew.sessionTypes) {
      expect(serviceSchema.shape.service_type.safeParse(t.key).success, t.key).toBe(true)
    }
  })

  it('departments: audio, lighting, video, staging, rigging, management, labor, other', () => {
    expect(crew.sections).toEqual(['audio', 'lighting', 'video', 'staging', 'rigging', 'management', 'labor', 'other'])
  })

  it('nobody leads by role: with no lead picked, an admin must pick, even with a "Violin 1" on the show', () => {
    expect(crew.leadFallbackSkill).toBeNull()
    const seated: PositionForAfterGig[] = [
      {
        id: 'p1',
        status: 'confirmed',
        musician_id: 'm1',
        chair_number: 1,
        instrument: { name: 'Violin 1' },
        musician: { id: 'm1', first_name: 'A', last_name: 'B', email: 'a@example.test', is_leader: true },
      },
    ]
    expect(gigLead(seated, null, crew.leadFallbackSkill)).toEqual({ lead: null, source: 'needs-pick' })
    expect(gigLead(seated, 'm1', crew.leadFallbackSkill).source).toBe('chosen')
  })

  it('offers the three-call show and a blank show, nothing musical', () => {
    expect(crew.projectPresets).toEqual(['three-call-show', 'custom'])
    for (const key of VERTICAL_KEYS) {
      if (key === 'production_crew') continue
      expect(VERTICALS[key].projectPresets, key).not.toContain('three-call-show')
    }
  })
})

describe('the three-call show preset', () => {
  const types = new Set(crew.sessionTypes.map((t) => t.key))

  it('one day: load-in, show day and strike on that day, using the crew call types', () => {
    const calls = threeCallShowServices('Acme GA', '2026-11-06', '2026-11-06')
    expect(calls).toEqual([
      { name: 'Acme GA Load-in', service_type: 'load_in', date: '2026-11-06', start: '06:00', end: '10:00', call: '05:30' },
      { name: 'Acme GA Show Day', service_type: 'show_call', date: '2026-11-06', start: '10:00', end: '22:00', call: '09:30' },
      { name: 'Acme GA Strike', service_type: 'strike', date: '2026-11-06', start: '22:00', end: '23:59', call: '22:00' },
    ])
    for (const c of calls) expect(types.has(c.service_type), c.service_type).toBe(true)
  })

  it('several days: load-in on the first day, show and strike on the last', () => {
    const calls = threeCallShowServices('Acme GA', '2026-11-06', '2026-11-07')
    expect(calls.map((c) => [c.service_type, c.date])).toEqual([
      ['load_in', '2026-11-06'],
      ['show_call', '2026-11-07'],
      ['strike', '2026-11-07'],
    ])
    for (const c of calls) expect(types.has(c.service_type), c.service_type).toBe(true)
  })

  it('one date given either way round is a one-day show; no date makes nothing', () => {
    expect(threeCallShowServices('X', null, '2026-11-07').map((c) => c.date)).toEqual(['2026-11-07', '2026-11-07', '2026-11-07'])
    expect(threeCallShowServices('X', '2026-11-06', null)).toHaveLength(3)
    expect(threeCallShowServices('X', null, null)).toEqual([])
  })
})

describe('brand resolution', () => {
  it('is Overhire for production_crew only', () => {
    expect(brandFor(crew)).toEqual({ name: 'Overhire', url: 'https://www.podiumpersonnel.com' })
    expect(productTitleFor(crew)).toBe('Overhire')
  })

  it('is Podium for every other vertical, and when there is no vertical at all', () => {
    for (const key of VERTICAL_KEYS) {
      if (key === 'production_crew') continue
      expect(brandFor(VERTICALS[key]), `${key} must stay Podium`).toEqual(DEFAULT_BRAND)
      expect(VERTICALS[key].brand, `${key} carries no brand`).toBeUndefined()
    }
    expect(brandFor(null)).toEqual(DEFAULT_BRAND)
    expect(brandFor(undefined)).toEqual(DEFAULT_BRAND)
    expect(productTitleFor(null)).toBe('Podium Personnel')
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
    responseUrl: 'https://app.example.test/gig/token123',
    expiresAt: null,
  }

  it('with no brand: the Podium footer and its tracked link, identical to brand: undefined', async () => {
    const html = await render(ContractOfferEmail({ ...baseProps }))
    expect(html).toContain(PODIUM_FOOTER_URL.replace(/&/g, '&amp;'))
    expect(html).not.toContain('Overhire')
    expect(await render(ContractOfferEmail({ ...baseProps, brand: VERTICALS.music_contractor.brand }))).toBe(html)
  })

  it('with the production_crew brand: Overhire and its link', async () => {
    const html = await render(ContractOfferEmail({ ...baseProps, brand: crew.brand }))
    expect(html).toContain('Overhire')
    expect(html).toContain('https://www.podiumpersonnel.com')
    expect(html).not.toContain('overhire.app')
  })
})
