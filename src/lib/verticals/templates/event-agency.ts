import { plainTitleRules } from '../title-rules'
import { EVENT_AGENCY_SEEDS } from '../seeds'
import type { VerticalTemplate } from '../types'

/**
 * Entertainment and event agencies — fast booking of performers onto events.
 * Books are hidden (agencies assemble per-event, not from saved lists);
 * the route stays reachable and functional by direct URL.
 */
export const eventAgency: VerticalTemplate = {
  key: 'event_agency',
  displayName: 'Entertainment Agency',
  description: 'Book performers for weddings, parties, and corporate events',
  terms: {
    person: { singular: 'Performer', plural: 'Performers' },
    work: { singular: 'Event', plural: 'Events' },
    session: { singular: 'Set', plural: 'Sets' },
    skill: { singular: 'Skill', plural: 'Skills' },
    groupList: { singular: 'Lineup', plural: 'Lineups' },
    materials: { singular: 'Material', plural: 'Materials' },
    rank: null,
  },
  nav: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'projects', label: 'Events', emphasize: true },
    { id: 'musicians', label: 'Performers' },
    { id: 'payments', label: 'Payments' },
    { id: 'venues', label: 'Venues' },
    { id: 'emails', label: 'Sent Emails' },
    { id: 'instruments', label: 'Skills' },
  ],
  features: {
    useChairs: false,
    useTitleInference: false,
    useEnsembleDetection: false,
    showBooksTab: false,
  },
  titleRules: plainTitleRules(null),
  skillSeeds: EVENT_AGENCY_SEEDS,
}
