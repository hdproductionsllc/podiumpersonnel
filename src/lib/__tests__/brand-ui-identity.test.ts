import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * What a music company and its musicians SEE, byte for byte, now that the
 * wordmark, the gig page's policy link and its session-type labels come from
 * the vertical (production_crew wears "Overhire", "Tech Policy", "(load-in)").
 *
 * The golden files under __golden__/brand-ui-*.html were written from master's
 * code (before the production_crew vertical), by running this file there,
 * where the extra props do not exist and are ignored. Do not regenerate them
 * to make this pass.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/components/payments/payment-status-dialog', () => ({ PaymentStatusDialog: () => null }))

import { GigPageClient } from '@/components/gig/gig-page-client'
import { Logo } from '@/components/ui/logo'
import { VERTICALS, term } from '@/lib/verticals'

const music = VERTICALS.music_contractor as unknown as {
  terms: Parameters<typeof term>[0]
  sessionTypes?: { key: string; workerLabel: string }[]
  brand?: { name: string }
}

// Exactly what src/app/gig/[token]/page.tsx passes for a music organization.
const verticalProps = {
  personTerm: term(music.terms, 'person'),
  sessionTypeLabels: music.sessionTypes ? Object.fromEntries(music.sessionTypes.map((t) => [t.key, t.workerLabel])) : undefined,
}

function gigPage(offerStatus: string) {
  return renderToStaticMarkup(
    createElement(GigPageClient, {
      token: 'tok',
      offerId: 'offer-1',
      offerStatus,
      expiresAt: null,
      musicianFirstName: 'Anna',
      organizationName: 'Test Quartet Co',
      organizationId: 'org-1',
      projectName: 'Smith Wedding',
      projectDescription: 'Garden ceremony',
      ensembleType: 'String Quartet',
      projectStartDate: '2026-11-07',
      projectEndDate: '2026-11-07',
      instrumentId: 'inst-violin',
      instrumentName: 'Violin 1',
      services: [
        { id: 's1', name: 'Rehearsal', service_type: 'rehearsal', call_time: null, start_time: '2026-11-06T23:00:00.000Z', end_time: '2026-11-07T00:00:00.000Z', venue: 'Hall', venue_2: null, base_pay: 100, leader_fee: 50 },
        { id: 's2', name: 'Ceremony', service_type: 'performance', call_time: '2026-11-07T22:30:00.000Z', start_time: '2026-11-07T23:00:00.000Z', end_time: '2026-11-08T00:00:00.000Z', venue: 'Garden', venue_2: null, base_pay: 250, leader_fee: 50 },
        { id: 's3', name: 'Dress', service_type: 'dress_rehearsal', call_time: null, start_time: '2026-11-07T20:00:00.000Z', end_time: '2026-11-07T21:00:00.000Z', venue: 'Garden', venue_2: null, base_pay: null, leader_fee: null },
      ],
      payAmount: 350,
      timezone: 'America/Chicago',
      instruments: [],
      existingSubRequest: null,
      workTerm: 'project',
      rankTerm: 'chair',
      ...verticalProps,
    } as never)
  )
}

describe('a music organization sees exactly what it saw before', () => {
  it.each(['pending', 'accepted'])('gig page, %s offer', async (status) => {
    await expect(gigPage(status)).toMatchFileSnapshot(`./__golden__/brand-ui-gig-page.${status}.html`)
  })

  it('wordmark (sidebar, header, sign-in): the brand name is the Podium default', async () => {
    const name = music.brand?.name ?? 'Podium'
    const html = (['sm', 'md', 'lg'] as const)
      .flatMap((size) => (['light', 'dark'] as const).map((variant) => renderToStaticMarkup(createElement(Logo, { size, variant, name } as never))))
      .join('\n')
    await expect(html).toMatchFileSnapshot('./__golden__/brand-ui-logo.html')
  })
})
