import { describe, it, expect } from 'vitest'
import {
  VERTICALS,
  VERTICAL_KEYS,
  addSessionChoices,
  countSessionTypes,
  newSessionDefaults,
  sessionColorKey,
  sessionTypeText,
  term,
} from '@/lib/verticals'
import { ALL_SERVICE_TYPES } from '@/lib/validations/projects'

/**
 * The "Add session" flow and the places that print a session's raw type, now
 * driven by the vertical. Every music vertical must get exactly what the old
 * hardcoded code produced; those old functions are copied inline below
 * (service-type-dialog.tsx, service-form-dialog.tsx getDefaultServiceName and
 * its times, projects-client's counts, dashboard-calendar's colours and badge,
 * the payments export's 'Service Type'). Do not change the copies.
 */

// --- master's code, verbatim in behaviour ---
function masterDefaultName(type: 'rehearsal' | 'performance', counts: { rehearsal: number; performance: number }): string {
  if (type === 'rehearsal') {
    const next = counts.rehearsal + 1
    if (next === 1) return 'Rehearsal 1'
    if (next === 2) return 'Dress Rehearsal'
    return `Rehearsal ${next}`
  }
  const next = counts.performance + 1
  if (next === 1) return 'Performance'
  return `Performance ${next}`
}
function masterTimes(type: 'rehearsal' | 'performance') {
  const start = type === 'rehearsal' ? '10:00' : '19:00'
  const endH = type === 'rehearsal' ? 13 : 22
  return { start, end: `${String(endH).padStart(2, '0')}:00` }
}

const MUSIC = VERTICAL_KEYS.filter((k) => k !== 'production_crew')
const crew = VERTICALS.production_crew

describe('a music vertical: the Add session flow is exactly what it was', () => {
  it.each(MUSIC)('%s: the dialog offers Rehearsal and Performance with their old hints', (key) => {
    const v = VERTICALS[key]
    expect(addSessionChoices(v)).toEqual([
      {
        key: 'rehearsal',
        label: 'Rehearsal',
        description: `Practice session for the ${term(v.terms, 'person', { plural: true, case: 'lower' })}`,
      },
      { key: 'performance', label: 'Performance', description: 'Concert or public performance' },
    ])
  })

  it.each(MUSIC)('%s: default names and times match master for every count', (key) => {
    const v = VERTICALS[key]
    for (let r = 0; r < 5; r++) {
      for (let p = 0; p < 5; p++) {
        for (const type of ['rehearsal', 'performance'] as const) {
          const services = [
            ...Array.from({ length: r }, () => ({ service_type: 'rehearsal' })),
            ...Array.from({ length: p }, () => ({ service_type: 'performance' })),
            { service_type: 'dress_rehearsal' },
          ]
          expect(newSessionDefaults(v, type, countSessionTypes(services))).toEqual({
            name: masterDefaultName(type, { rehearsal: r, performance: p }),
            ...masterTimes(type),
          })
        }
      }
    }
  })

  it.each(MUSIC)('%s: calendar colour and printed type are the raw type, as before', (key) => {
    const v = VERTICALS[key]
    for (const t of [...ALL_SERVICE_TYPES, 'something_else']) {
      expect(sessionColorKey(v, t)).toBe(t)
      expect(sessionTypeText(v, t)).toBe(t)
    }
    expect(sessionColorKey(v, null)).toBe('other')
    expect(sessionTypeText(v, null) || 'other').toBe('other')
  })
})

describe('a production crew never gets music-typed calls from Add call', () => {
  it('offers Load-in, Rehearsal, Show, Breakout and Strike, never Performance', () => {
    const choices = addSessionChoices(crew)
    expect(choices.map((c) => c.key)).toEqual(['load_in', 'rehearsal', 'show_call', 'breakout', 'strike'])
    expect(choices.map((c) => c.label)).toEqual(['Load-in', 'Rehearsal', 'Show', 'Breakout', 'Strike'])
    expect(choices.map((c) => c.key)).not.toContain('performance')
    for (const c of choices) expect(c.description.length).toBeGreaterThan(0)
    expect(choices.find((c) => c.key === 'rehearsal')!.description).toBe('Practice session for the crew')
  })

  it('every choice is one of its session types, so the call form shows it by its own label', () => {
    const keys = crew.sessionTypes.map((t) => t.key)
    for (const c of addSessionChoices(crew)) expect(keys).toContain(c.key)
  })

  it('default names come from the type label and count only that type', () => {
    expect(newSessionDefaults(crew, 'show_call', {})).toEqual({ name: 'Show', start: '19:00', end: '22:00' })
    expect(newSessionDefaults(crew, 'show_call', countSessionTypes([{ service_type: 'show_call' }, { service_type: 'load_in' }])).name).toBe('Show 2')
    expect(newSessionDefaults(crew, 'load_in', {})).toEqual({ name: 'Load-in', start: '06:00', end: '10:00' })
    expect(newSessionDefaults(crew, 'strike', { strike: 1 })).toEqual({ name: 'Strike 2', start: '22:00', end: '23:59' })
    for (const c of addSessionChoices(crew)) {
      expect(newSessionDefaults(crew, c.key, {}).name).not.toMatch(/Performance/)
    }
  })

  it('the show call wears the main colour; the calendar and export print "show", not "show_call"', () => {
    expect(sessionColorKey(crew, 'show_call')).toBe('performance')
    expect(sessionColorKey(crew, 'rehearsal')).toBe('rehearsal')
    expect(sessionColorKey(crew, 'load_in')).toBe('load_in')
    expect(sessionTypeText(crew, 'show_call')).toBe('show')
    expect(sessionTypeText(crew, 'load_in')).toBe('load-in')
  })
})
