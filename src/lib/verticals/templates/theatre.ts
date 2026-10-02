import { plainTitleRules } from '../title-rules'
import { THEATRE_SEEDS } from '../seeds'
import { MUSIC_SECTIONS, MUSIC_SESSION_TYPES, VIOLIN_ONE_LEAD } from '../defaults'
import type { VerticalTemplate } from '../types'

/** Theatre companies and school programs — cast & crew across productions. */
export const theatre: VerticalTemplate = {
  key: 'theatre',
  displayName: 'Theatre',
  description: 'Staff cast and crew across productions and performance runs',
  terms: {
    person: { singular: 'Company Member', plural: 'Company Members' },
    work: { singular: 'Production', plural: 'Productions' },
    session: { singular: 'Call', plural: 'Calls' },
    skill: { singular: 'Role', plural: 'Roles' },
    groupList: { singular: 'Cast List', plural: 'Cast Lists' },
    materials: { singular: 'Script', plural: 'Scripts' },
    rank: null,
  },
  nav: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'projects', label: 'Productions', emphasize: true },
    { id: 'musicians', label: 'Cast & Crew' },
    { id: 'books', label: 'Cast Lists' },
    { id: 'payments', label: 'Payments' },
    { id: 'venues', label: 'Venues' },
    { id: 'instruments', label: 'Roles' },
    { id: 'emails', label: 'Sent Emails' },
  ],
  features: {
    useChairs: false,
    useTitleInference: false,
    useEnsembleDetection: false,
    showBooksTab: true,
    useLeaderFee: true,
  },
  titleRules: plainTitleRules(null),
  skillSeeds: THEATRE_SEEDS,
  sessionTypes: MUSIC_SESSION_TYPES,
  mainSessionType: 'performance',
  sections: MUSIC_SECTIONS,
  leadFallbackSkill: VIOLIN_ONE_LEAD,
  projectPresets: [],
}
