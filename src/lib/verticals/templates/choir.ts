import { plainTitleRules } from '../title-rules'
import { CHOIR_SEEDS } from '../seeds'
import type { VerticalTemplate } from '../types'

/** Choirs, choruses, choral societies — voice parts, no chairs or titles. */
export const choir: VerticalTemplate = {
  key: 'choir',
  displayName: 'Choir / Chorus',
  description: 'Schedule singers, section leaders, and paid ringers',
  terms: {
    person: { singular: 'Singer', plural: 'Singers' },
    work: { singular: 'Concert', plural: 'Concerts' },
    session: { singular: 'Session', plural: 'Sessions' },
    skill: { singular: 'Voice Part', plural: 'Voice Parts' },
    groupList: { singular: 'Roster', plural: 'Rosters' },
    materials: { singular: 'Music', plural: 'Music' },
    rank: null,
  },
  nav: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'projects', label: 'Concerts', emphasize: true },
    { id: 'musicians', label: 'Singers' },
    { id: 'books', label: 'Rosters' },
    { id: 'payments', label: 'Payments' },
    { id: 'instruments', label: 'Voice Parts' },
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
  skillSeeds: CHOIR_SEEDS,
}
