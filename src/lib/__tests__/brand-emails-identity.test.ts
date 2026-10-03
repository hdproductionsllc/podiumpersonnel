import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE FOUR WORKER EMAILS THAT CAN WEAR A VERTICAL'S BRAND, byte for byte.
 *
 * sendContractOfferEmail, sendOfferReminderEmail, sendOfferAcceptedEmail and
 * sendGigDetailsEmail are the sends whose footer says "via Overhire" for a
 * production_crew organization. For a music organization they must send
 * exactly what they sent before the brand existed: the same sender, recipient,
 * reply-to, subject, HTML, plain text and headers.
 *
 * The golden files under __golden__/brand-*.music.json were written from
 * master's code (before the production_crew vertical), by running this file
 * there. Do not regenerate them to make this pass: a difference means a music
 * company's musicians would receive something new.
 *
 * Only the email provider is replaced (it records instead of sending); the
 * real templates, the real send code and the real vertical registry run.
 */

const state = vi.hoisted(() => ({ vertical: 'music_contractor' as string, sent: [] as Record<string, unknown>[] }))

vi.mock('@/lib/email/client', () => ({
  resend: {
    emails: {
      send: vi.fn(async (args: Record<string, unknown>) => {
        state.sent.push(args)
        return { data: { id: 'email-1' }, error: null }
      }),
    },
  },
  EMAIL_FROM_ADDRESS: 'hello@example.test',
  EMAIL_REPLY_TO: 'hello@example.test',
  buildFromAddress: (name?: string | null) => `${name || 'Podium'} <hello@example.test>`,
  filterRecipients: (to: string | string[]) => ({ allowed: Array.isArray(to) ? to : [to], suppressed: [] }),
  awaitResendSlot: async () => {},
}))

vi.mock('@/lib/supabase/server', () => ({
  getOrgOwnerEmail: async () => 'owner@example.test',
}))

vi.mock('@/lib/api-helpers', async () => ({
  getOrgVertical: async () => (await import('@/lib/verticals')).resolveVertical(state.vertical),
}))

import {
  sendContractOfferEmail,
  sendOfferReminderEmail,
  sendOfferAcceptedEmail,
  sendGigDetailsEmail,
} from '@/lib/email/send'

const ORG = { organizationName: 'Example Strings', organizationId: 'org-example' }
const SERVICE = {
  name: 'Ceremony',
  date: 'Saturday, November 7, 2026',
  callTime: '4:30 PM',
  time: '5:00 PM',
  endTime: '5:45 PM',
  venue: 'The Grand Hall',
  venueUrl: 'https://maps.example.test/hall',
  venueAddress: '1 Main St, Houston, TX 77002',
}

const sends = {
  'contract-offer': () =>
    sendContractOfferEmail({
      to: 'alex@example.test',
      musicianName: 'Alex',
      ...ORG,
      projectName: 'Smith Wedding',
      instrument: 'Violin 1',
      chairNumber: 1,
      totalChairs: 1,
      services: [SERVICE, { ...SERVICE, name: 'Cocktail Hour', callTime: null, time: '6:00 PM', endTime: '7:00 PM' }],
      responseUrl: 'https://app.example.test/gig/token-1',
      expiresAt: '2026-11-01T17:00:00.000Z',
      timezone: 'America/Chicago',
      notes: 'Black attire.',
      payAmount: 350,
      leaderFee: 50,
      isLeader: true,
      personalMessage: 'Hope you can make it!',
      ensembleType: 'String Quartet',
    }),
  'offer-reminder': () =>
    sendOfferReminderEmail({
      to: 'alex@example.test',
      musicianName: 'Alex',
      ...ORG,
      projectName: 'Smith Wedding',
      instrument: 'Viola',
      chairNumber: 1,
      totalChairs: 1,
      responseUrl: 'https://app.example.test/gig/token-1',
      expiresAt: '2026-11-01T17:00:00.000Z',
      daysRemaining: 2,
      performanceDate: 'Sat, Nov 7',
    }),
  'offer-accepted': () =>
    sendOfferAcceptedEmail({
      to: 'alex@example.test',
      musicianName: 'Alex',
      ...ORG,
      contactEmail: 'owner@example.test',
      projectName: 'Smith Wedding',
      instrument: 'Cello',
      chairNumber: 1,
      totalChairs: 1,
      services: [SERVICE],
      calendarUrl: 'https://app.example.test/api/offers/offer-1/calendar',
      googleCalendarUrl: 'https://calendar.example.test/add',
    }),
  'gig-details': () =>
    sendGigDetailsEmail({
      to: 'alex@example.test',
      musicianName: 'Alex',
      ...ORG,
      projectName: 'Smith Wedding',
      ensembleType: 'String Quartet',
      services: [{ ...SERVICE, parkingInfo: 'Lot B', directions: 'Side door' }],
      roster: [
        { name: 'Alex Rivera', instrument: 'Violin 1', email: 'alex@example.test', phone: '(713) 555-0101', isRecipient: true },
        { name: 'Sam Lee', instrument: 'Cello', email: 'sam@example.test', phone: null, isRecipient: false },
      ],
      confirmUrl: 'https://app.example.test/confirm/token-2',
      notes: 'Arrive 30 minutes early.',
    }),
} as const

beforeEach(() => {
  state.sent = []
  state.vertical = 'music_contractor'
})

describe('a music organization: the branded sends are exactly what they were', () => {
  it.each(Object.keys(sends) as (keyof typeof sends)[])('%s', async (kind) => {
    await sends[kind]()
    expect(state.sent).toHaveLength(1)
    await expect(JSON.stringify(state.sent[0], null, 2)).toMatchFileSnapshot(`./__golden__/brand-${kind}.music.json`)
  })
})

describe('a production company: the same sends say "via Overhire", and only that changes', () => {
  it.each(Object.keys(sends) as (keyof typeof sends)[])('%s', async (kind) => {
    state.vertical = 'production_crew'
    await sends[kind]()
    const crew = state.sent[0] as { html: string; text: string; subject: string; to: string[] }
    expect(crew.html).toContain('https://www.podiumpersonnel.com')
    expect(crew.html).toMatch(/via\s*(<!-- -->)?\s*<a[^>]*>Overhire<\/a>/)
    // The link stays on our own site until an Overhire domain is ours (2026-10-02).
    expect(crew.html).not.toContain('overhire.app')
    expect(crew.text).toContain('Overhire')
    expect(crew.text).not.toMatch(/via\s+Podium/)

    state.vertical = 'music_contractor'
    await sends[kind]()
    const music = state.sent[1] as typeof crew
    // Same recipient and subject: the brand never decides who is emailed or what it is called.
    expect(crew.to).toEqual(music.to)
    expect(crew.subject).toBe(music.subject)
    expect(music.html).toMatch(/via\s*(<!-- -->)?\s*<a[^>]*>Podium<\/a>/)
  })
})
