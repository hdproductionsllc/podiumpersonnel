import { plainTitleRules } from '../title-rules'
import { CHURCH_WORSHIP_SEEDS } from '../seeds'
import type { VerticalTemplate } from '../types'

/**
 * Churches and worship ministries — recurring services, volunteer + paid mix.
 * "Plan" matches the vocabulary church teams already use for a service's
 * run-sheet, so a Podium work item (project) reads naturally as a Plan.
 */
export const churchWorship: VerticalTemplate = {
  key: 'church_worship',
  displayName: 'Church / Worship',
  description: 'Schedule worship teams and paid musicians for services',
  terms: {
    person: { singular: 'Team Member', plural: 'Team Members' },
    work: { singular: 'Plan', plural: 'Plans' },
    session: { singular: 'Service', plural: 'Services' },
    skill: { singular: 'Team Role', plural: 'Team Roles' },
    groupList: { singular: 'Team', plural: 'Teams' },
    rank: null,
  },
  nav: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'projects', label: 'Plans', emphasize: true },
    { id: 'musicians', label: 'Team Members' },
    { id: 'books', label: 'Teams' },
    { id: 'payments', label: 'Payments' },
    { id: 'instruments', label: 'Team Roles' },
    { id: 'venues', label: 'Venues' },
    { id: 'emails', label: 'Sent Emails' },
  ],
  features: {
    useChairs: false,
    useTitleInference: false,
    useEnsembleDetection: false,
    showBooksTab: true,
  },
  titleRules: plainTitleRules(null),
  skillSeeds: CHURCH_WORSHIP_SEEDS,
}
