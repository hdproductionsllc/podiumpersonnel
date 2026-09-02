import type { PositionInfo } from '@/lib/orchestra-positions'
import type { InstrumentSection } from '@/lib/validations/instruments'

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
 * section must come from the existing INSTRUMENT_SECTIONS enum (zod-enforced
 * app-wide); non-music taxonomies use 'other' until per-vertical sections ship.
 */
export type SkillSeed = {
  name: string
  abbreviation: string
  section: InstrumentSection
  sort_order: number
}

/**
 * Product name and home URL shown in the wordmark, browser tab and email
 * footers. Absent means Podium (see brand.ts). Lets one deployment wear a
 * second name for a second market without a second codebase.
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
  /** Optional product brand; omit for Podium */
  brand?: VerticalBrand
  terms: TermDictionary
  nav: NavConfig
  features: VerticalFeatures
  titleRules: TitleRules
  /** 'sql' = seeded by the create_organization_with_owner RPC (music verticals) */
  skillSeeds: SkillSeed[] | 'sql'
}
