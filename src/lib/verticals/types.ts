import type { PositionInfo } from '@/lib/orchestra-positions'
import type { InstrumentSection } from '@/lib/validations/instruments'
import type { ServiceType } from '@/lib/validations/projects'

/**
 * Vertical templates: per-organization-type configuration for outward-facing
 * terminology, navigation, skill taxonomy, and title logic. The database keeps
 * its original nouns (musicians, instruments, books, chair_number) — templates
 * only change what users SEE. The 'music_contractor' template must always
 * reproduce the pre-verticals UI string-for-string (guarded by
 * vertical-identity.test.ts); existing organizations default to it.
 */

export const VERTICAL_KEYS = [
  'music_contractor',
  'orchestra_band',
  'choir',
  'theatre',
  'dance',
  'church_worship',
  'event_agency',
  'production_crew',
] as const

export type VerticalKey = (typeof VERTICAL_KEYS)[number]

export type TermForms = { singular: string; plural: string }

/**
 * The six outward-facing nouns. Stored in Title Case; lowercase variants are
 * derived (no term may contain an acronym — enforced by registry tests).
 * rank === null means the vertical has no rank/chair concept at all.
 */
export type TermDictionary = {
  /** Musician / Singer / Dancer / Company Member / Team Member / Performer */
  person: TermForms
  /** Project / Concert / Production / Plan / Event */
  work: TermForms
  /** Service / Session / Call / Set */
  session: TermForms
  /** Instrument / Voice Part / Role / Team Role / Skill */
  skill: TermForms
  /** Saved Ensemble / Roster / Cast List / Team / Lineup */
  groupList: TermForms
  /**
   * What gets distributed to people ahead of the work: Music / Parts for a
   * music vertical, Materials or Documents elsewhere. The feature is the same
   * either way — files attached to a project, sent to whoever is on it.
   */
  materials: TermForms
  /** Chair — or null (no rank concept) */
  rank: TermForms | null
}

export type VerticalFeatures = {
  /** Show chair-number UI (badges, chair columns) */
  useChairs: boolean
  /** Apply orchestral title inference (Concertmaster, Principal, …) */
  useTitleInference: boolean
  /** Show the ensemble-drift suggestion banner (String Quartet detection) */
  useEnsembleDetection: boolean
  /** Show the books ("Saved Ensembles") nav tab */
  showBooksTab: boolean
  /**
   * The leader fee exists here: the service form's Leader Fee field and the
   * Send Offer "include leader fee" box are shown. Off: both are hidden and a
   * new service is written with a leader fee of 0 (the column's database
   * default is 50, and every reader treats 0 as "no leader fee").
   */
  useLeaderFee: boolean
}

/** Stable ids — routes and icons live in the sidebar's NAV_META, keyed by these. */
export type NavItemId =
  | 'dashboard'
  | 'projects'
  | 'musicians'
  | 'books'
  | 'payments'
  | 'venues'
  | 'instruments'
  | 'emails'

export type NavItem = { id: NavItemId; label: string; emphasize?: boolean }
export type NavConfig = NavItem[]

export type PositionInput = { instrument_name: string; chair_number: number }

export type TitleRules = {
  getPositionTitle(
    instrumentName: string,
    chairNumber: number,
    section?: string | null,
    totalChairs?: number,
    ensembleSize?: number
  ): PositionInfo
  checkGroupDrift(
    currentType: string | null,
    positions: PositionInput[]
  ): { drifted: boolean; suggestion: string | null }
}

/**
 * Rows seeded into the org's `instruments` table on creation.
 * section must be one of the vertical's own `sections` (registry test).
 */
export type SkillSeed = {
  name: string
  abbreviation: string
  section: InstrumentSection
  sort_order: number
}

/**
 * One kind of session (services.service_type) as this vertical offers it.
 *   label        what admins see (the service form's Type list)
 *   workerLabel  what a worker sees after the session's name on the gig page.
 *                For the music verticals this is the raw type, exactly as the
 *                gig page has always printed it.
 */
export type SessionTypeOption = {
  key: ServiceType
  label: string
  workerLabel: string
}

/**
 * Who leads a gig when no admin named a lead: the confirmed person in this
 * skill, lowest rank first (after-gig/rules.ts gigLead). `matches` decides
 * which skill names count ("Violin 1" also matches "Violin I").
 */
export type LeadFallbackSkill = {
  label: string
  matches: (skillName: string | null | undefined) => boolean
}

/** The new-project presets (project-form-dialog's template picker). */
export type ProjectPresetKey =
  | 'string-quartet'
  | 'string-trio'
  | 'duo'
  | 'solo'
  | 'orchestra'
  | 'three-call-show'
  | 'custom'

/**
 * Product name and home URL shown in the wordmark, browser tab and the
 * worker-facing email footers ("via Overhire"). Absent means Podium (brand.ts).
 */
export type VerticalBrand = {
  name: string
  url: string
}

export type VerticalTemplate = {
  key: VerticalKey
  /** Shown on the onboarding picker card */
  displayName: string
  /** One-liner under the card title */
  description: string
  /** Optional product brand; omitted for Podium (every vertical but production_crew) */
  brand?: VerticalBrand
  terms: TermDictionary
  nav: NavConfig
  features: VerticalFeatures
  titleRules: TitleRules
  /** 'sql' = seeded by the create_organization_with_owner RPC (music verticals) */
  skillSeeds: SkillSeed[] | 'sql'
  /** The session types offered, in order */
  sessionTypes: readonly SessionTypeOption[]
  /**
   * The type of a gig's main session: the one a blank project creates, and the
   * one whose times the project form edits for a one-day gig.
   */
  mainSessionType: ServiceType
  /** The sections skills are grouped under, in order (labels: SECTION_LABELS) */
  sections: readonly InstrumentSection[]
  /** Who leads a gig nobody picked a lead for; null: an admin must always pick */
  leadFallbackSkill: LeadFallbackSkill | null
  /** New-project presets offered, in order; empty: no picker, straight to the blank form */
  projectPresets: readonly ProjectPresetKey[]
}
