import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * 'superseded' (093) and 'released' used to render nothing: on the gig page a
 * replaced or released musician saw the gig with no status line and no buttons
 * (audit C, Step 5), and the offers list showed a replaced offer as bare text.
 * The gig page is rendered to HTML here, without a browser; the offers list's
 * badge maps are checked directly (history rows render only once unfolded).
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/components/payments/payment-status-dialog', () => ({ PaymentStatusDialog: () => null }))

import { GigPageClient } from '@/components/gig/gig-page-client'
import { OFFER_STATUS_COLORS, OFFER_STATUS_LABELS } from '@/components/projects/project-offers'

function gigPage(offerStatus: string) {
  return renderToStaticMarkup(
    createElement(GigPageClient, {
      token: 'tok',
      offerId: 'offer-1',
      offerStatus,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
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
    })
  )
}

describe('gig page', () => {
  it('tells a musician whose offer was replaced that no answer is needed, with no buttons', () => {
    const html = gigPage('superseded')
    expect(html).toContain('This offer has been replaced and is no longer open. No response is needed.')
    expect(html).not.toMatch(/>\s*Accept/)
  })

  it('tells a released musician they are released from the engagement', () => {
    const html = gigPage('released')
    expect(html).toContain('You have been released from this engagement. No action is needed.')
    expect(html).not.toMatch(/>\s*Accept/)
  })

  it('leaves the existing messages as they were', () => {
    expect(gigPage('rescinded')).toContain('This offer was withdrawn by the organization. No response is needed.')
    expect(gigPage('declined')).toContain('You have declined this offer.')
    expect(gigPage('superseded')).not.toContain('released from this engagement')
  })
})

describe('offers list badges', () => {
  // Every status contract_offers allows (063 + 093) has a label and a colour.
  const STATUSES = ['pending', 'viewed', 'accepted', 'declined', 'rescinded', 'expired', 'released', 'superseded']

  it.each(STATUSES)('%s has a label and a colour', (status) => {
    expect(OFFER_STATUS_LABELS[status]).toBeTruthy()
    expect(OFFER_STATUS_COLORS[status]).toMatch(/bg-.*dark:/)
  })

  it('a superseded offer reads "Replaced", a released one "Released"', () => {
    expect(OFFER_STATUS_LABELS.superseded).toBe('Replaced')
    expect(OFFER_STATUS_LABELS.released).toBe('Released')
  })
})
