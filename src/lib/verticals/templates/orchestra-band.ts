import { orchestralTitleRules } from '../title-rules'
import { MUSIC_PROJECT_PRESETS, MUSIC_SECTIONS, MUSIC_SESSION_TYPES, VIOLIN_ONE_LEAD } from '../defaults'
import type { VerticalTemplate } from '../types'

/** Orchestras, bands, big bands, community ensembles — full orchestral behavior. */
export const orchestraBand: VerticalTemplate = {
  key: 'orchestra_band',
  displayName: 'Orchestra / Band',
  description: 'Manage personnel and substitutes for orchestras, bands, and large ensembles',
  terms: {
    person: { singular: 'Musician', plural: 'Musicians' },
    work: { singular: 'Concert', plural: 'Concerts' },
    session: { singular: 'Service', plural: 'Services' },
    skill: { singular: 'Instrument', plural: 'Instruments' },
    groupList: { singular: 'Roster', plural: 'Rosters' },
    materials: { singular: 'Music', plural: 'Music' },
    rank: { singular: 'Chair', plural: 'Chairs' },
  },
  nav: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'projects', label: 'Concerts', emphasize: true },
    { id: 'musicians', label: 'Musicians' },
    { id: 'books', label: 'Rosters' },
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
  mainSessionType: 'performance',
  sections: MUSIC_SECTIONS,
  leadFallbackSkill: VIOLIN_ONE_LEAD,
  projectPresets: MUSIC_PROJECT_PRESETS,
}
