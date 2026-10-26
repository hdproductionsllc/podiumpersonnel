import { describe, it, expect } from 'vitest'
import { reportingThreshold, paymentTaxYear, necDueDate } from '@/lib/payments/tax-year'
import { reportRecipients, type PositionForAfterGig } from '@/lib/after-gig/rules'
import { boundedImportForm, MAX_IMPORT_BYTES } from '@/lib/import/bounded-body'
import { render } from '@react-email/render'
import { PaySummaryEmail } from '@/lib/email/templates/pay-summary'
import { GigReportRequestEmail } from '@/lib/email/templates/gig-report-request'

describe('selected payment tax year', () => {
  it('uses verified year thresholds, never guesses a future inflation amount', () => {
    expect(reportingThreshold(2025)).toBe(600)
    expect(reportingThreshold(2026)).toBe(2000)
    expect(reportingThreshold(2027)).toBeNull()
    expect(reportingThreshold(2030)).toBeNull()
  })
  it('does not shift January 1 into the prior year or invent missing payment dates', () => {
    expect(paymentTaxYear('2026-01-01')).toBe(2026)
    expect(paymentTaxYear('2025-12-31')).toBe(2025)
    expect(paymentTaxYear(null)).toBeNull()
    expect(paymentTaxYear('bad')).toBeNull()
  })
  it('moves Saturday/Sunday January 31 to Monday', () => {
    expect(necDueDate(2024)).toBe('2025-01-31')
    expect(necDueDate(2025)).toBe('2026-02-02')
    expect(necDueDate(2026)).toBe('2027-02-01')
  })
})

describe('reviewed played roster', () => {
  const seat = (id: string, status = 'confirmed'): PositionForAfterGig => ({
    id: 'chair-' + id, status, musician_id: id,
    musician: { id, first_name: id, last_name: null, email: id + '@example.test', is_leader: false },
  })
  it('requires attendance review even when every invitation was accepted', () => {
    expect(reportRecipients([seat('player')], null)).toEqual([])
    expect(reportRecipients([seat('player')], [])).toEqual([])
  })
  it('includes the seated sub, excludes replaced/released/declined/offered people and deduplicates chairs', () => {
    const positions = [seat('sub'), seat('sub'), seat('player'), seat('released', 'released'), seat('declined', 'declined'), seat('invited', 'offered')]
    expect(reportRecipients(positions, ['original', 'sub', 'sub', 'player', 'released', 'declined', 'invited']).map(p => p.musicianId)).toEqual(['sub', 'player'])
  })
  it('does not attribute a joined musician mismatch to the current seat', () => {
    expect(reportRecipients([{ ...seat('sub'), musician_id: 'original' }], ['original'])).toEqual([])
  })
})

describe('bounded spreadsheet import', () => {
  it('rejects an oversized body without trusting Content-Length', async () => {
    await expect(boundedImportForm(new Request('http://localhost/import', { method: 'POST', body: new Uint8Array(MAX_IMPORT_BYTES + 65537), headers: { 'Content-Length': '1' } }))).rejects.toThrow('5 MB')
  })
  it('accepts a small valid multipart upload', async () => {
    const form = new FormData(); form.set('file', new File(['First,Last\nTest,Player'], 'test.csv'))
    const encoded = new Response(form)
    const parsed = await boundedImportForm(new Request('http://localhost/import', { method: 'POST', body: await encoded.arrayBuffer(), headers: { 'Content-Type': encoded.headers.get('content-type')! } }))
    expect((parsed.get('file') as File).name).toBe('test.csv')
  })
})

describe('safe email rendering', () => {
  it('pay rows use email tables and remain readable in plain text', async () => {
    const email = PaySummaryEmail({ organizationName: 'Test', projectName: 'A long gig title', gigDate: 'October 25, 2026', lines: [{ musicianId: 'one', name: 'Long Musician Name', instrument: 'Violin 1', basePay: 1234.5, leaderFee: 50, total: 1284.5 }], grandTotal: 1284.5, paymentsUrl: 'https://example.test/pay' })
    const html = await render(email)
    expect(html).not.toContain('display:flex')
    expect(html).toContain('vertical-align:top')
    const plain = await render(email, { plainText: true })
    expect(plain).toContain('Long Musician Name')
    expect(plain).toContain('$1,284.50')
    expect(plain).toContain('leader fee')
  })
  it('survey email accurately describes the short survey without implying lead status', async () => {
    const plain = await render(GigReportRequestEmail({ organizationName: 'Test', leadFirstName: 'Player', projectName: 'Gig', gigDate: 'October 25', reportUrl: 'https://example.test/report/test' }), { plainText: true })
    expect(plain).toContain('Thanks for playing')
    expect(plain).toContain('Notes, client feedback and photos are optional')
    expect(plain).not.toContain('arrangements')
  })
})
