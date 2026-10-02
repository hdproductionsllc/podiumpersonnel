import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { PaySummaryEmail } from '@/lib/email/templates/pay-summary'
import { noLeadReason } from '@/lib/after-gig/rules'
import { VERTICALS } from '@/lib/verticals'

/**
 * The after-gig pay summary's "no gig lead" notice, worded by the vertical.
 *
 * __golden__/pay-summary.needs-lead.html was rendered from master's template
 * (before the notice took the vertical's lead label). A music company's admins
 * must keep receiving exactly that: "nobody is confirmed in Violin 1 and no gig
 * lead was picked". Do not regenerate it to make this pass.
 */

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
  it('a music organization (no label passed, or the Violin 1 label) gets exactly what master sent', async () => {
    const before = await render(PaySummaryEmail(base))
    await expect(before).toMatchFileSnapshot('./__golden__/pay-summary.needs-lead.html')
    const music = VERTICALS.music_contractor.leadFallbackSkill!.label
    expect(await render(PaySummaryEmail({ ...base, leadFallbackLabel: music }))).toBe(before)
  })

  it('a production crew (no lead role) never mentions Violin 1', async () => {
    const html = await render(PaySummaryEmail({ ...base, leadFallbackLabel: null }))
    expect(html).not.toContain('Violin 1 and')
    expect(text(html)).toContain('No gig report was requested: no gig lead was picked.')
  })

  it('noLeadReason: the gig page notice keeps its music wording; a crew is told nobody was picked', () => {
    expect(noLeadReason(VERTICALS.music_contractor.leadFallbackSkill)).toBe('Nobody is confirmed in Violin 1')
    expect(noLeadReason(VERTICALS.production_crew.leadFallbackSkill)).toBe('No gig lead was picked')
  })
})
