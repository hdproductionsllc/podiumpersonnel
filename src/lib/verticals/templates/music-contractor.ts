import { orchestralTitleRules } from '../title-rules'
import { MUSIC_PROJECT_PRESETS, MUSIC_SECTIONS, MUSIC_SESSION_TYPES, MUSIC_ADD_SESSION_TYPES, VIOLIN_ONE_LEAD } from '../defaults'
import type { VerticalTemplate } from '../types'

/**
 * THE DEFAULT. All pre-verticals organizations resolve to this template, and
 * it must reproduce the original UI string-for-string — every label below is
 * frozen by vertical-identity.test.ts. Do not "improve" wording here.
 */
export const musicContractor: VerticalTemplate = {
  key: 'music_contractor',
  displayName: 'Music Contractor',
  description: 'Staff freelance musicians for gigs, churches, and events',
  terms: {
    person: { singular: 'Musician', plural: 'Musicians' },
    work: { singular: 'Project', plural: 'Projects' },
    session: { singular: 'Service', plural: 'Services' },
    skill: { singular: 'Instrument', plural: 'Instruments' },
    groupList: { singular: 'Saved Ensemble', plural: 'Saved Ensembles' },
    materials: { singular: 'Music', plural: 'Music' },
    rank: { singular: 'Chair', plural: 'Chairs' },
  },
  nav: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'projects', label: 'Projects', emphasize: true },
    { id: 'musicians', label: 'Musicians' },
    { id: 'books', label: 'Saved Ensembles' },
    { id: 'payments', label: 'Payments' },
    { id: 'venues', label: 'Venues' },
    { id: 'instruments', label: 'Instruments' },
    { id: 'emails', label: 'Sent Emails' },
  ],
  features: {
    useChairs: true,
    useTitleInference: true,
    useEnsembleDetection: true,
    showBooksTab: true,
    useLeaderFee: true,
  },
  titleRules: orchestralTitleRules,
  skillSeeds: 'sql',
  sessionTypes: MUSIC_SESSION_TYPES,
  addSessionTypes: MUSIC_ADD_SESSION_TYPES,
  mainSessionType: 'performance',
  sections: MUSIC_SECTIONS,
  leadFallbackSkill: VIOLIN_ONE_LEAD,
  projectPresets: MUSIC_PROJECT_PRESETS,
}
