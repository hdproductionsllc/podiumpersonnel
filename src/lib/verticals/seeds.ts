import type { SkillSeed } from './types'

/**
 * Skill taxonomies seeded into the `instruments` table for NEW organizations
 * of non-music verticals (music verticals keep the SQL seed inside the
 * create_organization_with_owner RPC for deploy-gap safety).
 *
 * section is 'other' across the board: INSTRUMENT_SECTIONS is a fixed enum
 * (strings/woodwinds/brass/percussion/other) enforced by zod app-wide.
 * Per-vertical section sets are a v1.1 item; until then these group under a
 * single heading.
 */

export const CHOIR_SEEDS: SkillSeed[] = [
  { name: 'Soprano 1', abbreviation: 'S1', section: 'other', sort_order: 100 },
  { name: 'Soprano 2', abbreviation: 'S2', section: 'other', sort_order: 101 },
  { name: 'Alto 1', abbreviation: 'A1', section: 'other', sort_order: 102 },
  { name: 'Alto 2', abbreviation: 'A2', section: 'other', sort_order: 103 },
  { name: 'Tenor 1', abbreviation: 'T1', section: 'other', sort_order: 104 },
  { name: 'Tenor 2', abbreviation: 'T2', section: 'other', sort_order: 105 },
  { name: 'Bass 1', abbreviation: 'B1', section: 'other', sort_order: 106 },
  { name: 'Bass 2', abbreviation: 'B2', section: 'other', sort_order: 107 },
  { name: 'Section Leader', abbreviation: 'SL', section: 'other', sort_order: 108 },
  { name: 'Accompanist', abbreviation: 'Acc', section: 'other', sort_order: 109 },
  { name: 'Director', abbreviation: 'Dir', section: 'other', sort_order: 110 },
]

export const THEATRE_SEEDS: SkillSeed[] = [
  { name: 'Lead', abbreviation: 'Lead', section: 'other', sort_order: 100 },
  { name: 'Supporting', abbreviation: 'Supp', section: 'other', sort_order: 101 },
  { name: 'Ensemble', abbreviation: 'Ens', section: 'other', sort_order: 102 },
  { name: 'Understudy', abbreviation: 'U/S', section: 'other', sort_order: 103 },
  { name: 'Swing', abbreviation: 'Swing', section: 'other', sort_order: 104 },
  { name: 'Stage Manager', abbreviation: 'SM', section: 'other', sort_order: 105 },
  { name: 'Assistant Stage Manager', abbreviation: 'ASM', section: 'other', sort_order: 106 },
  { name: 'Director', abbreviation: 'Dir', section: 'other', sort_order: 107 },
  { name: 'Music Director', abbreviation: 'MD', section: 'other', sort_order: 108 },
  { name: 'Choreographer', abbreviation: 'Choreo', section: 'other', sort_order: 109 },
  { name: 'Lighting Technician', abbreviation: 'LX', section: 'other', sort_order: 110 },
  { name: 'Sound Technician', abbreviation: 'Sound', section: 'other', sort_order: 111 },
  { name: 'Crew', abbreviation: 'Crew', section: 'other', sort_order: 112 },
]

export const DANCE_SEEDS: SkillSeed[] = [
  { name: 'Principal', abbreviation: 'Prin', section: 'other', sort_order: 100 },
  { name: 'Soloist', abbreviation: 'Solo', section: 'other', sort_order: 101 },
  { name: 'Company Dancer', abbreviation: 'Co', section: 'other', sort_order: 102 },
  { name: 'Apprentice', abbreviation: 'App', section: 'other', sort_order: 103 },
  { name: 'Guest Artist', abbreviation: 'Guest', section: 'other', sort_order: 104 },
  { name: 'Rehearsal Director', abbreviation: 'RD', section: 'other', sort_order: 105 },
  { name: 'Choreographer', abbreviation: 'Choreo', section: 'other', sort_order: 106 },
]

export const CHURCH_WORSHIP_SEEDS: SkillSeed[] = [
  { name: 'Worship Leader', abbreviation: 'WL', section: 'other', sort_order: 100 },
  { name: 'Vocals', abbreviation: 'Vox', section: 'other', sort_order: 101 },
  { name: 'Keys', abbreviation: 'Keys', section: 'other', sort_order: 102 },
  { name: 'Piano / Organ', abbreviation: 'Pno', section: 'other', sort_order: 103 },
  { name: 'Acoustic Guitar', abbreviation: 'AGtr', section: 'other', sort_order: 104 },
  { name: 'Electric Guitar', abbreviation: 'EGtr', section: 'other', sort_order: 105 },
  { name: 'Bass', abbreviation: 'Bass', section: 'other', sort_order: 106 },
  { name: 'Drums', abbreviation: 'Drums', section: 'other', sort_order: 107 },
  { name: 'Percussion', abbreviation: 'Perc', section: 'other', sort_order: 108 },
  { name: 'Strings', abbreviation: 'Str', section: 'other', sort_order: 109 },
  { name: 'Sound / FOH', abbreviation: 'FOH', section: 'other', sort_order: 110 },
  { name: 'Media / Slides', abbreviation: 'Media', section: 'other', sort_order: 111 },
]

export const EVENT_AGENCY_SEEDS: SkillSeed[] = [
  { name: 'Vocalist', abbreviation: 'Vox', section: 'other', sort_order: 100 },
  { name: 'Instrumentalist', abbreviation: 'Inst', section: 'other', sort_order: 101 },
  { name: 'DJ', abbreviation: 'DJ', section: 'other', sort_order: 102 },
  { name: 'MC / Host', abbreviation: 'MC', section: 'other', sort_order: 103 },
  { name: 'Specialty Act', abbreviation: 'Act', section: 'other', sort_order: 104 },
  { name: 'Sound Technician', abbreviation: 'Sound', section: 'other', sort_order: 105 },
]
