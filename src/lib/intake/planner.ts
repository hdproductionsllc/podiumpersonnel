/**
 * Client song planner (082) — the pure half.
 *
 * Bounds, section vocabulary and list normalization for the tokenized client
 * page. Everything here is deterministic and dependency-free so the save
 * endpoint, the page and the tests all agree on one set of rules.
 *
 * The rule that shapes this file: **nothing the client sends is trusted.** The
 * client may set section, title, artist, role, note and ORDER. It may never set
 * a repertoire id, a match status, an org id or an intake id — those come from
 * the token, server-side, and the matcher's output is never returned to them.
 */

import type { IntakeSection } from './types'

// --- bounds ------------------------------------------------------------------

/** Owner's answer: 120. A big wedding runs 60–80; this is headroom, not a target. */
export const PLANNER_MAX_SONGS = 120

/** Title / artist / role. Long enough for "Jesu, Joy of Man's Desiring (Bach)". */
export const PLANNER_MAX_FIELD_CHARS = 200

/**
 * Notes get more room than the other fields. A real note — "play this while the
 * grandmothers are seated, then fade when the doors open" — runs past 200, and
 * truncating what a client wrote about their own wedding is the wrong failure.
 */
export const PLANNER_MAX_NOTE_CHARS = 500

/** Who walks in, in order. Long enough for any wedding party. */
export const PLANNER_MAX_PROCESSIONAL = 40

/**
 * Weddings book far out — 12–18 months is normal — so the link has to outlive
 * the booking. Acceptable because the page guards a song list, not money, and
 * carries no PII beyond what the client typed themselves.
 */
export const PLANNER_LINK_TTL_DAYS = 550

/** Owner's answer: the list is due a month before the event. */
export const PLANNER_DUE_DAYS_BEFORE_EVENT = 30

/** Nudges, in days before the due date. 0 = on the day it's due. */
export const PLANNER_REMINDER_OFFSETS = [30, 14, 3, 0] as const

// --- sections ----------------------------------------------------------------

/** 069's CHECK set. A section outside this is rejected, never folded. */
const VALID_SECTIONS: readonly IntakeSection[] = [
  'prelude', 'ceremony', 'recessional', 'postlude', 'cocktail_hour', 'reception', 'other',
]

export function isPlannerSection(value: unknown): value is IntakeSection {
  return typeof value === 'string' && (VALID_SECTIONS as readonly string[]).includes(value)
}

/** Client-facing lane names. Not the book's ALL-CAPS labels — this is a form. */
export const PLANNER_SECTION_LABELS: Record<IntakeSection, string> = {
  prelude: 'Prelude',
  ceremony: 'Ceremony',
  recessional: 'Recessional',
  postlude: 'Postlude',
  cocktail_hour: 'Cocktail Hour',
  reception: 'Reception',
  other: 'Song List',
}

/** One line under each lane, in the client's language, not ours. */
export const PLANNER_SECTION_HINTS: Record<IntakeSection, string> = {
  prelude: 'While your guests are arriving and being seated.',
  ceremony: 'Everything from the processional through to the vows.',
  recessional: 'The walk back up the aisle, right after you\'re married.',
  postlude: 'While your guests leave the ceremony.',
  cocktail_hour: 'Drinks and mingling after the ceremony.',
  reception: 'Dinner and the rest of the evening.',
  other: 'Anything you\'d like us to play.',
}

const WEDDING_CEREMONY: IntakeSection[] = ['prelude', 'ceremony', 'recessional', 'postlude']

/**
 * Which lanes a client sees, driven by what they actually booked
 * (`projects.event_type`, whose values are EVENT_TYPES in validations/projects).
 *
 * This matters more than it looks: a "recessional" lane on a corporate booking
 * is how a form starts feeling like paperwork, and a client who scrolls past
 * four empty lanes stops filling any of them in.
 *
 * Unknown or missing type falls back to the single generic lane — never to the
 * full wedding set, which would be the noisy failure.
 */
export function sectionsForEventType(eventType: string | null | undefined): IntakeSection[] {
  switch ((eventType ?? '').trim()) {
    case 'Ceremony':
      return WEDDING_CEREMONY
    case 'Cocktail Hour':
      return ['cocktail_hour']
    case 'Ceremony & Cocktail Hour':
      return [...WEDDING_CEREMONY, 'cocktail_hour']
    case 'Reception':
      return ['reception']
    default:
      return ['other']
  }
}

/** The walk order only makes sense when there's a ceremony to walk into. */
export function showsProcessionalOrder(sections: IntakeSection[]): boolean {
  return sections.includes('ceremony')
}

/**
 * Ceremony moments, offered as suggestions on a ceremony row. Free text underneath
 * — this list is a shortcut, not a vocabulary the client has to fit into.
 */
export const CEREMONY_ROLES = [
  'Seating of the Families',
  'Processional',
  'Bridal Party Entrance',
  "Bride's Entrance",
  'Unity Candle / Sand',
  'Communion',
  'Signing of the Register',
] as const

// --- normalization -----------------------------------------------------------

export interface PlannerSongInput {
  section?: unknown
  titleRaw?: unknown
  artistRaw?: unknown
  role?: unknown
  notes?: unknown
}

/** A validated row, ready for intake_songs minus the server-set columns. */
export interface NormalizedPlannerSong {
  section: IntakeSection
  position: number
  title_raw: string
  artist_raw: string | null
  role: string | null
  notes: string | null
}

export type NormalizeResult =
  | { ok: true; songs: NormalizedPlannerSong[] }
  | { ok: false; error: string }

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Validate and renumber the client's list.
 *
 * Order comes from ARRAY ORDER, not from any position the client sends —
 * positions are assigned densely per section here, so a client that skips,
 * repeats or negates a number cannot collide with 069's
 * UNIQUE (intake_id, section, position).
 *
 * Rows with no title are dropped, not rejected: an empty row at the bottom of a
 * lane is just a client who is still typing, and an autosave must not fail on it.
 */
export function normalizePlannerSongs(input: unknown): NormalizeResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'Songs must be a list.' }
  }
  if (input.length > PLANNER_MAX_SONGS) {
    return {
      ok: false,
      error: `That's more than ${PLANNER_MAX_SONGS} songs — please shorten the list, or get in touch and we'll help.`,
    }
  }

  const songs: NormalizedPlannerSong[] = []
  const nextPosition = new Map<IntakeSection, number>()

  for (const raw of input as PlannerSongInput[]) {
    const row = (raw ?? {}) as PlannerSongInput

    if (!isPlannerSection(row.section)) {
      return { ok: false, error: 'That song list contains a section we don\'t recognize.' }
    }

    const title = cleanText(row.titleRaw)
    if (!title) continue // still typing — not an error

    const artist = cleanText(row.artistRaw)
    const role = cleanText(row.role)
    const notes = cleanText(row.notes)

    if (title.length > PLANNER_MAX_FIELD_CHARS) {
      return { ok: false, error: `Song titles are limited to ${PLANNER_MAX_FIELD_CHARS} characters.` }
    }
    if (artist && artist.length > PLANNER_MAX_FIELD_CHARS) {
      return { ok: false, error: `Artist names are limited to ${PLANNER_MAX_FIELD_CHARS} characters.` }
    }
    if (role && role.length > PLANNER_MAX_FIELD_CHARS) {
      return { ok: false, error: `Moments are limited to ${PLANNER_MAX_FIELD_CHARS} characters.` }
    }
    if (notes && notes.length > PLANNER_MAX_NOTE_CHARS) {
      return { ok: false, error: `Notes are limited to ${PLANNER_MAX_NOTE_CHARS} characters.` }
    }

    const position = nextPosition.get(row.section) ?? 0
    nextPosition.set(row.section, position + 1)

    songs.push({
      section: row.section,
      position,
      title_raw: title,
      artist_raw: artist,
      // A role on a non-ceremony row is meaningless; drop it rather than carry
      // it into the book's playlist page.
      role: row.section === 'ceremony' ? role : null,
      notes,
    })
  }

  return { ok: true, songs }
}

/** The walk order: plain strings, bounded, blanks dropped. */
export function normalizeProcessionalOrder(
  input: unknown
): { ok: true; order: string[] } | { ok: false; error: string } {
  if (input == null) return { ok: true, order: [] }
  if (!Array.isArray(input)) return { ok: false, error: 'The walking order must be a list.' }
  if (input.length > PLANNER_MAX_PROCESSIONAL) {
    return { ok: false, error: `The walking order is limited to ${PLANNER_MAX_PROCESSIONAL} entries.` }
  }

  const order: string[] = []
  for (const entry of input) {
    const text = cleanText(entry)
    if (!text) continue
    if (text.length > PLANNER_MAX_FIELD_CHARS) {
      return { ok: false, error: `Each line of the walking order is limited to ${PLANNER_MAX_FIELD_CHARS} characters.` }
    }
    order.push(text)
  }
  return { ok: true, order }
}

// --- dates -------------------------------------------------------------------

/**
 * When the list is due: the event date minus 30 days, at end of that day so a
 * client filing it "on the due date" is never late by a timezone.
 *
 * Returns null when the project has no date yet — no date, no deadline, and the
 * reminder job simply skips the intake rather than inventing one.
 */
export function plannerDueAt(eventDate: string | null | undefined): string | null {
  if (!eventDate) return null
  const event = new Date(eventDate)
  if (Number.isNaN(event.getTime())) return null
  const due = new Date(event.getTime() - PLANNER_DUE_DAYS_BEFORE_EVENT * 24 * 60 * 60 * 1000)
  due.setUTCHours(23, 59, 59, 0)
  return due.toISOString()
}

export function plannerLinkExpiry(from = new Date()): string {
  return new Date(from.getTime() + PLANNER_LINK_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
}
