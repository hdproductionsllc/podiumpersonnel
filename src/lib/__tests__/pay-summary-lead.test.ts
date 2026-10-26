import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { PaySummaryEmail } from '@/lib/email/templates/pay-summary'
import { noLeadReason } from '@/lib/after-gig/rules'
import { VERTICALS } from '@/lib/verticals'

/** The new attendance-review notice supersedes the historical lead-only snapshot. */

const base = {
  organizationName: 'Test Quartet Co',
  projectName: 'Smith Wedding',
  gigDate: 'Saturday, November 7, 2026',
  lines: [
    { musicianId: 'm1', name: 'Anna Lee', instrument: 'Violin 1', basePay: 250, leaderFee: 50, total: 300 },
    { musicianId: 'm2', name: 'Ben Ortiz', instrument: 'Cello', basePay: 250, leaderFee: 0, total: 250 },
  ],
  grandTotal: 550,
  paymentsUrl: 'https://app.example.test/dashboard/payments?project=p1',
  needsGigLead: true,
  projectUrl: 'https://app.example.test/dashboard/projects?expand=p1',
}

const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/<!-- -->/g, '').replace(/&#x27;/g, "'")

describe('pay summary: the no-lead notice', () => {
  it('a music organization (no label passed, or the Violin 1 label) gets the same attendance-review wording', async () => {
    const before = await render(PaySummaryEmail(base))
    expect(text(before)).toContain('Confirm who played before requesting reports.')
    expect(before).not.toContain('display:flex')
    expect(before).toContain('<table')
    const music = VERTICALS.music_contractor.leadFallbackSkill!.label
    expect(await render(PaySummaryEmail({ ...base, leadFallbackLabel: music }))).toBe(before)
  })

  it('a production crew (no lead role) never mentions Violin 1', async () => {
    const html = await render(PaySummaryEmail({ ...base, leadFallbackLabel: null }))
    expect(html).not.toContain('Violin 1 and')
    expect(text(html)).toContain('Confirm who played before requesting reports.')
  })

  it('noLeadReason: the gig page notice keeps its music wording; a crew is told nobody was picked', () => {
    expect(noLeadReason(VERTICALS.music_contractor.leadFallbackSkill)).toBe('Nobody is confirmed in Violin 1')
    expect(noLeadReason(VERTICALS.production_crew.leadFallbackSkill)).toBe('No gig lead was picked')
  })
})
