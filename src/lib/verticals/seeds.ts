import type { SkillSeed } from './types'

/**
 * Skill taxonomies seeded into the `instruments` table for NEW organizations
 * of non-music verticals (music verticals keep the SQL seed inside the
 * create_organization_with_owner RPC for deploy-gap safety).
 *
 * Each seed's section must be one of its vertical's `sections` (registry
 * test). The verticals that share the music sections use 'other' throughout,
 * so they group under a single heading; production_crew has its own
 * departments.
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

/**
 * Production crew roles, in the order a crew coordinator writes a call:
 * audio, lighting, video, then rigging, hands and leadership. Abbreviations
 * are the ones techs use on a call sheet ("A1", "L1", "V1"). Each sits in its
 * department (the production_crew vertical's `sections`).
 */
export const PRODUCTION_CREW_SEEDS: SkillSeed[] = [
  { name: 'A1 (FOH Audio Engineer)', abbreviation: 'A1', section: 'audio', sort_order: 100 },
  { name: 'A2 (Monitor / Stage Audio)', abbreviation: 'A2', section: 'audio', sort_order: 101 },
  { name: 'Breakout Tech', abbreviation: 'Breakout', section: 'audio', sort_order: 102 },
  { name: 'L1 (Lighting Designer)', abbreviation: 'L1', section: 'lighting', sort_order: 200 },
  { name: 'L2 (Lighting Tech)', abbreviation: 'L2', section: 'lighting', sort_order: 201 },
  { name: 'V1 (Video Director)', abbreviation: 'V1', section: 'video', sort_order: 300 },
  { name: 'V2 (Video Tech)', abbreviation: 'V2', section: 'video', sort_order: 301 },
  { name: 'Camera Operator', abbreviation: 'Cam', section: 'video', sort_order: 302 },
  { name: 'Graphics Operator', abbreviation: 'GFX', section: 'video', sort_order: 303 },
  { name: 'Projectionist', abbreviation: 'Proj', section: 'video', sort_order: 304 },
  { name: 'LED Tech', abbreviation: 'LED', section: 'video', sort_order: 305 },
  { name: 'Rigger', abbreviation: 'Rig', section: 'rigging', sort_order: 500 },
  { name: 'Stagehand', abbreviation: 'Hand', section: 'labor', sort_order: 600 },
  { name: 'Truck / Driver', abbreviation: 'Truck', section: 'labor', sort_order: 601 },
  { name: 'Stage Manager', abbreviation: 'SM', section: 'management', sort_order: 700 },
  { name: 'Show Caller', abbreviation: 'Caller', section: 'management', sort_order: 701 },
]
