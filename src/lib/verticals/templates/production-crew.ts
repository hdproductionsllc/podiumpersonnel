import { plainTitleRules } from '../title-rules'
import { PRODUCTION_CREW_SEEDS } from '../seeds'
import type { VerticalTemplate } from '../types'

/**
 * Live-event production companies — AV, lighting, staging and video shops
 * that book freelance technicians per show. The engine is unchanged: a show
 * is a project, its calls (load-in, show, strike) are services, and each role
 * on the crew list is a position sent down a ranked call list.
 *
 * This vertical carries its own brand ("Overhire") so the same deployment can
 * be demoed to production companies without a second codebase. Everything
 * else about the UI is the terminology below. See tasks/fork-concept-crew.md.
 */
const rank = { singular: 'Slot', plural: 'Slots' }

export const productionCrew: VerticalTemplate = {
  key: 'production_crew',
  displayName: 'Production Company',
  description: 'Book freelance crew onto shows: A1, L1, hands, and everyone in between',
  brand: {
    name: 'Overhire',
    url: 'https://overhire.app',
  },
  terms: {
    person: { singular: 'Tech', plural: 'Crew' },
    work: { singular: 'Show', plural: 'Shows' },
    session: { singular: 'Call', plural: 'Calls' },
    skill: { singular: 'Role', plural: 'Roles' },
    groupList: { singular: 'Crew List', plural: 'Crew Lists' },
    materials: { singular: 'Show Doc', plural: 'Show Docs' },
    rank,
  },
  nav: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'projects', label: 'Shows', emphasize: true },
    { id: 'musicians', label: 'Crew' },
    { id: 'payments', label: 'Payments' },
    { id: 'venues', label: 'Venues' },
    { id: 'emails', label: 'Sent Emails' },
    { id: 'instruments', label: 'Roles' },
  ],
  features: {
    // Slots number the repeated roles (Stagehand 1..4); no orchestral titles.
    useChairs: true,
    useTitleInference: false,
    useEnsembleDetection: false,
    showBooksTab: false,
  },
  titleRules: plainTitleRules(rank),
  skillSeeds: PRODUCTION_CREW_SEEDS,
}
