import { plainTitleRules } from '../title-rules'
import { PRODUCTION_CREW_SEEDS } from '../seeds'
import { CREW_SECTIONS } from '@/lib/validations/instruments'
import { CREW_SERVICE_TYPES, SERVICE_TYPE_LABELS } from '@/lib/validations/projects'
import type { VerticalTemplate } from '../types'

/**
 * Live-event production companies: AV, lighting, staging and video shops that
 * book freelance technicians per show (target architecture section 5). The
 * engine is the same one every vertical runs on: a show is a project, its
 * calls (load-in, show, strike) are services, and each role on the crew list
 * is a chair sent down a ranked call list. A crew org is created with
 * call_scoped_requirements and allow_worker_drop on (migrations 100 and 096),
 * so a stagehand can be booked for the load-in only and can say "I can't make
 * it"; auto-offer stays off like everyone else's.
 *
 * It wears its own brand ("Overhire") in the wordmark, the browser tab and
 * the worker-facing email footers. Nothing else differs from the lists below.
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
    // Slots number the repeated roles (Stagehand 1..8); no orchestral titles.
    useChairs: true,
    useTitleInference: false,
    useEnsembleDetection: false,
    // Crews are assembled per show, not from saved lists.
    showBooksTab: false,
    // A crew is paid its agreed rate; there is no leader fee.
    useLeaderFee: false,
  },
  titleRules: plainTitleRules(rank),
  skillSeeds: PRODUCTION_CREW_SEEDS,
  sessionTypes: CREW_SERVICE_TYPES.map((key) => ({
    key,
    label: SERVICE_TYPE_LABELS[key],
    workerLabel: SERVICE_TYPE_LABELS[key].toLowerCase(),
  })),
  // Every call type but 'other' (still on the call form's Type list).
  addSessionTypes: CREW_SERVICE_TYPES.filter((key) => key !== 'other'),
  mainSessionType: 'show_call',
  sections: CREW_SECTIONS,
  // Nobody leads a show by role: the admin always names the crew chief.
  leadFallbackSkill: null,
  projectPresets: ['three-call-show', 'custom'],
}
