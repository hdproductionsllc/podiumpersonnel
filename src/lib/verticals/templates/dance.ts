import { plainTitleRules } from '../title-rules'
import { DANCE_SEEDS } from '../seeds'
import type { VerticalTemplate } from '../types'

/** Dance and ballet companies — dancers and casting across productions. */
export const dance: VerticalTemplate = {
  key: 'dance',
  displayName: 'Dance Company',
  description: 'Manage dancers and casting across productions',
  terms: {
    person: { singular: 'Dancer', plural: 'Dancers' },
    work: { singular: 'Production', plural: 'Productions' },
    session: { singular: 'Call', plural: 'Calls' },
    skill: { singular: 'Role', plural: 'Roles' },
    groupList: { singular: 'Roster', plural: 'Rosters' },
    materials: { singular: 'Music', plural: 'Music' },
    rank: null,
  },
  nav: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'projects', label: 'Productions', emphasize: true },
    { id: 'musicians', label: 'Dancers' },
    { id: 'books', label: 'Rosters' },
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
  },
  titleRules: plainTitleRules(null),
  skillSeeds: DANCE_SEEDS,
}
