import type { ServiceType } from '@/lib/validations/projects'
import { term } from './terms'
import type { TermDictionary, VerticalTemplate } from './types'

/**
 * How a vertical's session types are offered and shown outside the service
 * form's Type list: the "Add session" choices, a new session's default name
 * and times, the dashboard calendar's colour, and the label a type is printed
 * with in places that have always shown the raw type.
 *
 * For every music vertical each function returns exactly what the code it
 * replaced produced (vertical-sessions.test.ts freezes them against inline
 * copies), so a music company sees nothing new.
 */

/** One button in the "Add session" dialog. */
export type AddSessionChoice = {
  key: ServiceType
  label: string
  description: string
}

/** The one-line hint under each choice. The music two are today's literal text. */
function choiceDescription(type: ServiceType, terms: TermDictionary): string {
  switch (type) {
    case 'rehearsal':
      return `Practice session for the ${term(terms, 'person', { plural: true, case: 'lower' })}`
    case 'performance':
      return 'Concert or public performance'
    case 'load_in':
      return 'Bring the gear in and set it up'
    case 'show_call':
      return 'The show itself'
    case 'breakout':
      return 'A breakout room or side session'
    case 'strike':
      return 'Take it all down and load out'
    default:
      return ''
  }
}

function labelOf(vertical: VerticalTemplate, type: string): string {
  return vertical.sessionTypes.find((t) => t.key === type)?.label ?? type
}

/** The "Add session" dialog's buttons, in order (music: Rehearsal, Performance). */
export function addSessionChoices(vertical: VerticalTemplate): AddSessionChoice[] {
  return vertical.addSessionTypes.map((key) => ({
    key,
    label: labelOf(vertical, key),
    description: choiceDescription(key, vertical.terms),
  }))
}

/** How many sessions of each type a gig already has (keyed by services.service_type). */
export type SessionCounts = Partial<Record<string, number>>

export function countSessionTypes(services: readonly { service_type: string | null }[]): SessionCounts {
  const counts: SessionCounts = {}
  for (const s of services) {
    if (!s.service_type) continue
    counts[s.service_type] = (counts[s.service_type] ?? 0) + 1
  }
  return counts
}

/** Default wall-clock times (HH:mm) for a new session of each type; anything else: 19:00 to 22:00. */
const DEFAULT_TIMES: Partial<Record<ServiceType, { start: string; end: string }>> = {
  rehearsal: { start: '10:00', end: '13:00' },
  load_in: { start: '06:00', end: '10:00' },
  breakout: { start: '09:00', end: '17:00' },
  strike: { start: '22:00', end: '23:59' },
}
const EVENING = { start: '19:00', end: '22:00' }

/**
 * A new session's default name, start and end (the call is 30 minutes before
 * the start). The second rehearsal is the "Dress Rehearsal", as it always has
 * been; any other type is its label, numbered from the second one on
 * ("Performance", "Performance 2"; "Show", "Show 2").
 */
export function newSessionDefaults(
  vertical: VerticalTemplate,
  type: ServiceType,
  counts: SessionCounts
): { name: string; start: string; end: string } {
  const next = (counts[type] ?? 0) + 1
  const label = labelOf(vertical, type)
  let name: string
  if (type === 'rehearsal') {
    name = next === 2 ? 'Dress Rehearsal' : `${label} ${next}`
  } else {
    name = next === 1 ? label : `${label} ${next}`
  }
  const times = DEFAULT_TIMES[type] ?? EVENING
  return { name, ...times }
}

/**
 * Which calendar colour a session wears: the vertical's main session shares
 * the performance colour, rehearsals keep theirs, everything else is "other".
 * The identity for music, whose main session is 'performance'.
 */
export function sessionColorKey(vertical: VerticalTemplate, type: string | null | undefined): string {
  const t = type || 'other'
  return t === vertical.mainSessionType ? 'performance' : t
}

/**
 * A type as printed where the raw type has always been shown (the calendar's
 * badge, the payments export). Music's workerLabel IS the raw type, so music
 * prints exactly what it did; a crew prints "show", "load-in".
 */
export function sessionTypeText(vertical: VerticalTemplate, type: string | null | undefined): string {
  if (!type) return ''
  return vertical.sessionTypes.find((t) => t.key === type)?.workerLabel ?? type
}
