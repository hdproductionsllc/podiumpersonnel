/**
 * Proves the email terminology plumbing works end-to-end:
 *  - a template rendered with the DEFAULT (music) terms produces today's words,
 *  - rendered with another vertical's terms it adapts,
 *  - and omitting `terms` is byte-identical to passing the default (the identity
 *    invariant for all 6 live music orgs).
 */
import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { ContractOfferEmail } from '@/lib/email/templates/contract-offer'
import { resolveVertical, DEFAULT_TERMS } from '@/lib/verticals'

const baseProps = {
  musicianName: 'Alex Rivera',
  organizationName: 'Test Org',
  projectName: 'Spring Concert',
  instrument: 'Cello',
  chairNumber: 1,
  totalChairs: 2,
  services: [],
  responseUrl: 'https://app.example.com/gig/token123',
  expiresAt: null,
}

describe('email terminology adapts per vertical', () => {
  // React Email inserts <!-- --> markers between adjacent JSX nodes, so assert on
  // the individual swept words rather than multi-node phrases.
  it('renders the music (default) nouns with DEFAULT_TERMS', async () => {
    const html = await render(ContractOfferEmail({ ...baseProps, terms: DEFAULT_TERMS }))
    expect(html).toContain('Musician') // person
    expect(html).toContain('instrument') // skill (lowercase, mid-sentence)
    expect(html).not.toContain('Singer')
    expect(html).not.toContain('voice part')
  })

  it("renders the choir's nouns with choir terms", async () => {
    const html = await render(ContractOfferEmail({ ...baseProps, terms: resolveVertical('choir').terms }))
    expect(html).toContain('Singer') // person
    expect(html).toContain('voice part') // skill
    expect(html).not.toContain('Musician')
    expect(html).not.toContain('instrument')
  })

  it('omitting terms is identical to passing the default terms (identity invariant)', async () => {
    const withoutTerms = await render(ContractOfferEmail({ ...baseProps }))
    const withDefaultTerms = await render(ContractOfferEmail({ ...baseProps, terms: DEFAULT_TERMS }))
    expect(withoutTerms).toBe(withDefaultTerms)
  })
})
