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
  created_at: string
  updated_at: string
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
  created_at: string
  updated_at: string
}
