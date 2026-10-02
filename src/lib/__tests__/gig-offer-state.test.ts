import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describeGigOffer, type GigOfferStateInput } from '@/lib/staffing/gig-offer-state'

/**
 * The plan, B1.4: the gig page says one plain sentence for every state an
 * offer and its gig can be in. Before, an 'expired' offer (collected by the
 * cron) rendered nothing at all, and a cancelled or finished gig read as
 * "withdrawn by the organization". Each state is checked twice: the sentence
 * describeGigOffer picks, and the page as rendered to HTML.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import { GigPageClient } from '@/components/gig/gig-page-client'

// Relative to the real clock: the rendered page checks the deadline against it.
const NOW = new Date()
const FUTURE = new Date(NOW.getTime() + 2 * 86_400_000).toISOString()
const PAST = new Date(NOW.getTime() - 86_400_000).toISOString()

const base: GigOfferStateInput = {
  offerStatus: 'pending',
  expiresAt: FUTURE,
  projectStatus: 'active',
  musicianActive: true,
  chairHeldByOther: false,
  workTerm: 'project',
  rankTerm: 'chair',
  organizationName: 'Test Quartet Co',
  now: NOW,
}

const cases: { name: string; input: Partial<GigOfferStateInput>; key: string; sentence: string | null }[] = [
  { name: 'pending', input: {}, key: 'open', sentence: null },
  { name: 'viewed', input: { offerStatus: 'viewed' }, key: 'open', sentence: null },
  { name: 'no deadline', input: { expiresAt: null }, key: 'open', sentence: null },
  { name: 'accepted', input: { offerStatus: 'accepted' }, key: 'accepted', sentence: 'You have accepted this offer.' },
  { name: 'declined', input: { offerStatus: 'declined' }, key: 'declined', sentence: 'You have declined this offer.' },
  {
    name: "expired (the cron's status)",
    input: { offerStatus: 'expired' },
    key: 'expired',
    sentence: 'This offer has expired and can no longer be accepted. If you are still available, please contact Test Quartet Co.',
  },
  {
    name: 'past its deadline, cron not run yet',
    input: { expiresAt: PAST },
    key: 'expired',
    sentence: 'This offer has expired and can no longer be accepted. If you are still available, please contact Test Quartet Co.',
  },
  {
    name: 'rescinded',
    input: { offerStatus: 'rescinded' },
    key: 'rescinded',
    sentence: 'This offer was withdrawn by the organization. No response is needed.',
  },
  {
    name: 'superseded',
    input: { offerStatus: 'superseded' },
    key: 'superseded',
    sentence: 'This offer has been replaced and is no longer open. No response is needed. If you received a newer offer, please answer that one.',
  },
  {
    name: 'released',
    input: { offerStatus: 'released' },
    key: 'released',
    sentence: 'You have been released from this engagement. No action is needed.',
  },
  {
    name: 'released because they said they could not make it',
    input: { offerStatus: 'released', releasedReason: 'dropped', organizationName: 'Test Quartet Co' },
    key: 'released',
    sentence: "You let Test Quartet Co know you can't make it, so you are no longer booked for this project. No action is needed.",
  },
  {
    name: 'chair filled by someone else (superseded)',
    input: { offerStatus: 'superseded', chairHeldByOther: true },
    key: 'filled_by_other',
    sentence: 'This chair has been filled by someone else, so this offer is closed. No response is needed.',
  },
  {
    name: 'chair filled by someone else (expired)',
    input: { offerStatus: 'expired', chairHeldByOther: true },
    key: 'filled_by_other',
    sentence: 'This chair has been filled by someone else, so this offer is closed. No response is needed.',
  },
  {
    name: 'gig cancelled, offer open',
    input: { projectStatus: 'cancelled' },
    key: 'gig_cancelled',
    sentence: 'This project has been cancelled. No response is needed.',
  },
  {
    name: 'gig cancelled after accepting',
    input: { offerStatus: 'accepted', projectStatus: 'cancelled' },
    key: 'gig_cancelled',
    sentence: 'This project has been cancelled, so you are no longer booked for it. No action is needed.',
  },
  {
    name: 'gig completed, offer never answered',
    input: { projectStatus: 'completed' },
    key: 'gig_completed',
    sentence: 'This project has already taken place, so this offer is closed. No response is needed.',
  },
  {
    name: 'musician deactivated, offer open',
    input: { musicianActive: false },
    key: 'rescinded',
    sentence: 'This offer was withdrawn by the organization. No response is needed.',
  },
  {
    name: 'a status this code does not know',
    input: { offerStatus: 'something_new' },
    key: 'closed',
    sentence: 'This offer is no longer open. No response is needed.',
  },
]

function gigPage(input: Partial<GigOfferStateInput>) {
  const i = { ...base, ...input }
  return renderToStaticMarkup(
    createElement(GigPageClient, {
      token: 'tok',
      offerId: 'offer-1',
      offerStatus: i.offerStatus ?? '',
      expiresAt: i.expiresAt ?? null,
      musicianFirstName: 'Anna',
      organizationName: 'Test Quartet Co',
      organizationId: 'org-1',
      projectName: 'Smith Wedding',
      projectDescription: null,
      ensembleType: 'quartet',
      projectStartDate: '2026-11-07',
      projectEndDate: '2026-11-07',
      instrumentId: 'inst-violin',
      instrumentName: 'Violin',
      services: [],
      payAmount: 200,
      timezone: 'America/Chicago',
      instruments: [],
      existingSubRequest: null,
      projectStatus: i.projectStatus,
      musicianActive: i.musicianActive,
      chairHeldByOther: i.chairHeldByOther,
      workTerm: i.workTerm,
      rankTerm: i.rankTerm,
      releasedReason: i.releasedReason,
    })
  )
}

const escape = (s: string) => s.replace(/'/g, '&#x27;')

describe('describeGigOffer: one sentence per state', () => {
  it.each(cases)('$name', ({ input, key, sentence }) => {
    const state = describeGigOffer({ ...base, ...input })
    expect(state.key).toBe(key)
    expect(state.message).toBe(sentence)
  })

  it('uses the vertical\'s words', () => {
    expect(
      describeGigOffer({ ...base, projectStatus: 'cancelled', workTerm: 'production' }).message
    ).toBe('This production has been cancelled. No response is needed.')
    // A vertical without chairs ('' rank) still gets a word.
    expect(
      describeGigOffer({ ...base, offerStatus: 'superseded', chairHeldByOther: true, rankTerm: '' }).message
    ).toBe('This spot has been filled by someone else, so this offer is closed. No response is needed.')
  })

  it('a finished gig leaves answered offers with their own sentence', () => {
    expect(describeGigOffer({ ...base, offerStatus: 'accepted', projectStatus: 'completed' }).key).toBe('accepted')
    expect(describeGigOffer({ ...base, offerStatus: 'declined', projectStatus: 'completed' }).key).toBe('declined')
  })

  it('a declined or withdrawn offer keeps its sentence when someone else has the chair', () => {
    expect(describeGigOffer({ ...base, offerStatus: 'declined', chairHeldByOther: true }).key).toBe('declined')
    expect(describeGigOffer({ ...base, offerStatus: 'rescinded', chairHeldByOther: true }).key).toBe('rescinded')
  })
})

describe('the gig page renders it', () => {
  it.each(cases.filter((c) => c.sentence !== null))('$name: shows the sentence and no Accept button', ({ input, key, sentence }) => {
    const html = gigPage(input)
    expect(html).toContain(escape(sentence!))
    expect(html).toContain(`data-offer-state="${key}"`)
    expect(html).not.toMatch(/>\s*Accept Offer/)
  })

  it.each(cases.filter((c) => c.sentence === null))('$name: shows the Accept and Decline buttons', ({ input }) => {
    const html = gigPage(input)
    expect(html).toMatch(/>\s*Accept Offer/)
    expect(html).toMatch(/>\s*Decline/)
    expect(html).not.toContain('data-offer-state')
  })

  it('never renders a card with no status sentence and no buttons', () => {
    for (const status of ['pending', 'viewed', 'accepted', 'declined', 'rescinded', 'expired', 'released', 'superseded', 'unknown']) {
      const html = gigPage({ offerStatus: status })
      expect(html.includes('data-offer-state') || /Accept Offer/.test(html), status).toBe(true)
    }
  })
})

describe('the "I can’t make it" button (worker drop)', () => {
  const page = (extra: Record<string, unknown>) =>
    renderToStaticMarkup(
      createElement(GigPageClient, {
        token: 'tok',
        offerId: 'offer-1',
        offerStatus: 'accepted',
        expiresAt: null,
        musicianFirstName: 'Anna',
        organizationName: 'Test Quartet Co',
        organizationId: 'org-1',
        projectName: 'Smith Wedding',
        projectDescription: null,
        ensembleType: 'quartet',
        projectStartDate: '2026-11-07',
        projectEndDate: '2026-11-07',
        instrumentId: 'inst-violin',
        instrumentName: 'Violin',
        services: [],
        payAmount: 200,
        timezone: 'America/Chicago',
        instruments: [],
        existingSubRequest: null,
        ...extra,
      })
    )
  const button = /I can&#x27;t make it/

  it('is shown to someone who accepted, when the server says dropping is allowed', () => {
    const html = page({ canDrop: true })
    expect(html).toMatch(button)
    // The confirm step comes first: no form is posted from the first click.
    expect(html).not.toContain('data-drop-confirm')
  })

  it('is not shown when dropping is not allowed (the music default), so the page is as before', () => {
    const html = page({ canDrop: false })
    expect(html).not.toMatch(button)
    expect(html).toContain('Request a Substitute')
    expect(page({})).toBe(html)
  })

  it('waits while a substitute is being arranged', () => {
    const html = page({ canDrop: true, existingSubRequest: { id: 's1', status: 'pending_approval', suggested_sub_name: null } })
    expect(html).not.toMatch(button)
  })

  it('is never shown on an offer that is not accepted', () => {
    expect(page({ canDrop: true, offerStatus: 'pending', expiresAt: FUTURE })).not.toMatch(button)
  })
})
