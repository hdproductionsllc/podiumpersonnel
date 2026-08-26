// Book Builder Phase B — Intake import types.
//
// Manual types for the tables added in migration 069_intakes.sql. They live here
// (not in the generated src/types/database.ts) because that file is hand-maintained
// and does not yet carry the Book Builder tables; keep these in sync if 069 changes.
//
// IntakeRecord mirrors `intakes`, IntakeSong mirrors `intake_songs`. Column order
// and nullability match the migration exactly.

export type IntakeSource = '17hats' | 'manual' | 'client-form'

export type IntakeStatus = 'draft' | 'confirmed'

export type IntakeSection =
  | 'prelude'
  | 'ceremony'
  | 'recessional'
  | 'postlude'
  | 'cocktail_hour'
  | 'reception'
  | 'other'

// How confidently a parsed song was matched to the repertoire library (068).
//   matched   — a single unambiguous repertoire hit
//   ambiguous — multiple candidates; needs a human to pick
//   missing   — no repertoire match found (the default)
//   manual    — an admin set/overrode the match by hand on the review screen
export type IntakeMatchStatus = 'matched' | 'ambiguous' | 'missing' | 'manual'

// One questionnaire per project (intakes.project_id is UNIQUE). raw_text is the
// pasted questionnaire kept verbatim; recessional_cue is stored word-for-word.
export interface IntakeRecord {
  id: string
  organization_id: string
  project_id: string
  source: IntakeSource
  status: IntakeStatus
  raw_text: string | null
  contact_name: string | null
  contact_phone: string | null
  venue_note: string | null
  spotify_url: string | null
  processional_order: string[]
  recessional_cue: string | null
  notes: string | null
  confirmed_at: string | null
  /** Owner signed off that the assembled books look good and may be sent
   *  (071). Cleared by every save — approval covers one exact list. */
  books_approved_at: string | null
  created_at: string
  updated_at: string
}

/**
 * The client song planner's columns on `intakes` (082). Kept as a separate
 * interface so the shape of an intake as the REVIEW screen knows it (above) is
 * unchanged — the planner is additive, and code that never mints a link never
 * sees any of this.
 *
 * There is no new `status` value: 082 carries the client's progress in
 * timestamps so `status` keeps meaning exactly what it means today (the
 * operator's book-readiness gate). See plannerState() for the derivation.
 */
export interface IntakePlannerFields {
  /** 256-bit hex token for /plan/[token]. NULL = no live client page. */
  client_token: string | null
  client_token_expires_at: string | null
  client_link_sent_at: string | null
  /** When the client's list is due — defaults to the event date minus 30 days. */
  client_due_at: string | null
  client_opened_at: string | null
  /** Non-NULL = locked to the client. The operator clears it to reopen. */
  client_submitted_at: string | null
  client_last_reminder_at: string | null
}

export type IntakeRecordWithPlanner = IntakeRecord & IntakePlannerFields

/** The five states of the client's half, derived (never stored). */
export type PlannerState =
  | 'not-sent'
  | 'sent'
  | 'in-progress'
  | 'submitted'
  | 'expired'

export function plannerState(intake: Partial<IntakePlannerFields>, now = new Date()): PlannerState {
  if (!intake.client_token) return 'not-sent'
  // Submitted wins over expired: a list that arrived is not un-arrived by the
  // link going stale afterwards.
  if (intake.client_submitted_at) return 'submitted'
  if (intake.client_token_expires_at && new Date(intake.client_token_expires_at) < now) {
    return 'expired'
  }
  if (intake.client_opened_at) return 'in-progress'
  return 'sent'
}

// One proposed song per row. title_raw/artist_raw are what the parser read;
// matched_repertoire_id/match_status are what it matched to (nullable — a song
// can stay unmatched and still be reviewed/confirmed).
export interface IntakeSong {
  id: string
  intake_id: string
  organization_id: string
  section: IntakeSection
  position: number
  title_raw: string | null
  artist_raw: string | null
  role: string | null
  matched_repertoire_id: string | null
  match_status: IntakeMatchStatus
  notes: string | null
  /** Client explicitly requested a work outside the library ("(*special
   *  request*)" in the questionnaire, or the admin marked it). Added in 070. */
  special_request: boolean
  /** The list said we don't play this slot ("TACET - DJ will play"). Not a match
   *  failure and not a library work — nothing to find, nothing to build into a
   *  book, but the players still need to see it. Added in 083. */
  no_music: boolean
  created_at: string
  updated_at: string
}
