import { INSTRUMENT_SECTIONS } from '@/lib/validations/instruments'
import { SERVICE_TYPES, SERVICE_TYPE_LABELS } from '@/lib/validations/projects'
import type { LeadFallbackSkill, ProjectPresetKey, SessionTypeOption } from './types'

/**
 * Today's values for the lists and rules a vertical can change. Every vertical
 * that existed before production_crew carries exactly these, so adding the
 * fields changed nothing for them (vertical-identity.test.ts freezes the music
 * ones against inline copies).
 */

/**
 * The service form's Type list as it has always been. The gig page has always
 * printed the raw type after a session's name ("(performance)"), so that is
 * the worker label.
 */
export const MUSIC_SESSION_TYPES: readonly SessionTypeOption[] = SERVICE_TYPES.map((key) => ({
  key,
  label: SERVICE_TYPE_LABELS[key],
  workerLabel: key,
}))

/** The instrument sections as they have always been grouped. */
export const MUSIC_SECTIONS = INSTRUMENT_SECTIONS

/** True for the "Violin 1" instrument (the chair that usually leads the gig). */
export function isViolinOne(instrumentName: string | null | undefined): boolean {
  return /^\s*violin\s*(1|i)\s*$/i.test(instrumentName || '')
}

/** "The leader of the gig is usually violin 1" (David, 2026-09-27). */
export const VIOLIN_ONE_LEAD: LeadFallbackSkill = { label: 'Violin 1', matches: isViolinOne }

/** The music template picker, in its order. */
export const MUSIC_PROJECT_PRESETS: readonly ProjectPresetKey[] = [
  'string-quartet',
  'string-trio',
  'duo',
  'solo',
  'orchestra',
  'custom',
]
