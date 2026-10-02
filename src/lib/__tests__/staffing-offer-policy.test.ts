import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  ASAP_OFFER_EXPIRY,
  DEFAULT_OFFER_EXPIRY,
  NEXT_IN_LINE_OFFER_EXPIRY,
  SUBSTITUTE_OFFER_EXPIRY,
  expiryFromDialogChoice,
  parseOfferExpiry,
  resolveExpiresAt,
} from '@/lib/staffing/expiry'
import { termsSnapshot } from '@/lib/staffing/offers'

// offers.ts sits on top of the email stack; only its pure helpers are used here.
vi.mock('@/lib/supabase/server', () => ({}))
vi.mock('@/lib/email/send', () => ({}))
vi.mock('@/lib/email/log', () => ({ hasRecentFailure: async () => false }))

/**
 * The one expiry policy (src/lib/staffing/expiry.ts) and the 093 files.
 *
 * Identity tests: each old hand-written expiry formula, copied here verbatim
 * from the code it replaced, gives the same instant as the policy.
 */

const NOW = Date.UTC(2026, 9, 2, 15, 30, 0)
const DAY = 24 * 60 * 60 * 1000

describe('expiry: the old formulas and the policy agree', () => {
  // send-offer-dialog.tsx handleSend(), before this change.
  function oldDialog(expiresIn: string, customDeadline: string, now: number): string | null {
    let expiresAt: string | null = null
    if (expiresIn === '0.17') {
      expiresAt = new Date(now + 4 * 60 * 60 * 1000).toISOString()
    } else if (expiresIn === 'custom') {
      expiresAt = customDeadline ? new Date(customDeadline + 'T23:59:59').toISOString() : null
    } else if (expiresIn) {
      expiresAt = new Date(now + parseInt(expiresIn) * 24 * 60 * 60 * 1000).toISOString()
    }
    return expiresAt
  }

  const policy = (value: string, custom: string) =>
    resolveExpiresAt(expiryFromDialogChoice(value, custom) ?? { kind: 'none' }, NOW)

  it.each([
    ['0.17', ''],
    ['1', ''],
    ['2', ''],
    ['7', ''],
    ['', ''],
    ['custom', '2026-11-07'],
    ['custom', ''],
  ])('dialog choice %j (custom date %j)', (value, custom) => {
    expect(policy(value, custom)).toBe(oldDialog(value, custom, NOW))
  })

  it('the dialog default ("2") is DEFAULT_OFFER_EXPIRY, 48 hours', () => {
    expect(expiryFromDialogChoice('2', '')).toEqual(DEFAULT_OFFER_EXPIRY)
    expect(resolveExpiresAt(DEFAULT_OFFER_EXPIRY, NOW)).toBe(new Date(NOW + 2 * DAY).toISOString())
  })

  it('ASAP is 4 hours', () => {
    expect(expiryFromDialogChoice('0.17', '')).toEqual(ASAP_OFFER_EXPIRY)
  })

  it('"next in line" from the offers list is 7 days, as project-offers.tsx wrote it', () => {
    expect(resolveExpiresAt(NEXT_IN_LINE_OFFER_EXPIRY, NOW)).toBe(new Date(NOW + 7 * 24 * 60 * 60 * 1000).toISOString())
  })

  it('a substitute gets 7 days, as the approve route wrote it (setDate + 7, in UTC on the server)', () => {
    const old = new Date(NOW)
    old.setUTCDate(old.getUTCDate() + 7)
    expect(resolveExpiresAt(SUBSTITUTE_OFFER_EXPIRY, NOW)).toBe(old.toISOString())
  })
})

describe('parseOfferExpiry (request bodies)', () => {
  it.each([
    [{ kind: 'none' }, { kind: 'none' }],
    [{ kind: 'hours', hours: 48 }, { kind: 'hours', hours: 48 }],
    [{ kind: 'until', at: '2026-11-07T05:59:59.000Z' }, { kind: 'until', at: '2026-11-07T05:59:59.000Z' }],
  ])('accepts %j', (input, expected) => {
    expect(parseOfferExpiry(input)).toEqual(expected)
  })

  it.each([
    null,
    'soon',
    { kind: 'hours', hours: 0 },
    { kind: 'hours', hours: '48' },
    { kind: 'hours', hours: 24 * 400 },
    { kind: 'until', at: 'tomorrow-ish' },
    { kind: 'weeks', weeks: 1 },
  ])('refuses %j', (input) => {
    expect(parseOfferExpiry(input)).toBeNull()
  })
})

describe('terms snapshot', () => {
  const position = { id: 'pos-v1', chair_number: 1, instrument: { id: 'inst-violin', name: 'Violin' } }
  const services = [
    { id: 'svc-b', name: 'Cocktail Hour', start_time: '2026-11-07T22:30:00Z', base_pay: 100, leader_fee: null, venue_details: { name: 'x' } },
    { id: 'svc-a', name: 'Ceremony', start_time: '2026-11-07T21:00:00Z', base_pay: 150, leader_fee: 50 },
  ]

  it('records the pay inputs as given, never a recomputed amount', () => {
    const snap = termsSnapshot(position, services, { customPay: 250, includeLeaderFee: true, leaderFeeAmount: 50 }, 'T')
    expect(snap.pay).toEqual({ custom_pay: 250, include_leader_fee: true, leader_fee_amount: 50 })
    expect(snap).not.toHaveProperty('pay_amount')
  })

  it('leaves the leader fee out when it was not ticked, and unknown when the caller did not say', () => {
    expect(termsSnapshot(position, services, { customPay: null, includeLeaderFee: false, leaderFeeAmount: 0 }, 'T').pay).toEqual({
      custom_pay: null,
      include_leader_fee: false,
      leader_fee_amount: null,
    })
    expect((termsSnapshot(position, services, {}, 'T').pay as Record<string, unknown>).include_leader_fee).toBeNull()
  })

  it('lists the services in time order, with their rates, and does not touch the caller\'s array', () => {
    const snap = termsSnapshot(position, services, {}, 'T')
    expect((snap.services as { id: string }[]).map((s) => s.id)).toEqual(['svc-a', 'svc-b'])
    expect(snap.services).toEqual([
      expect.objectContaining({ id: 'svc-a', base_pay: 150, leader_fee: 50 }),
      expect.objectContaining({ id: 'svc-b', base_pay: 100, leader_fee: null }),
    ])
    expect(services[0].id).toBe('svc-b')
    expect(JSON.stringify(snap)).not.toContain('venue_details')
  })
})

describe('migration 093 and its paste script', () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, '../../..', rel), 'utf-8').replace(/\r\n/g, '\n')
  const migration = read('supabase/migrations/093_offer_columns.sql')
  const paste = read('scripts/sql/093-offer-columns.paste.sql')
  const code = (sql: string) => sql.replace(/--.*$/gm, '')

  it('the paste script carries the migration verbatim, inside one transaction', () => {
    const begin = paste.indexOf('\nBEGIN;\n')
    const commit = paste.indexOf('\nCOMMIT;\n')
    expect(begin).toBeGreaterThan(0)
    expect(commit).toBeGreaterThan(begin)
    expect(paste.slice(begin, commit)).toContain(migration.trim())
    expect(paste.slice(begin, commit)).toContain("VALUES ('093', '093_offer_columns')")
  })

  it('ends with a RESULTS table', () => {
    expect(paste.slice(paste.indexOf('\nCOMMIT;\n'))).toMatch(/RESULTS[\s\S]*'PASS'/)
  })

  it('keeps every existing status and adds superseded', () => {
    for (const status of ['pending', 'viewed', 'accepted', 'declined', 'rescinded', 'expired', 'released', 'superseded']) {
      expect(code(migration)).toContain(`'${status}'`)
    }
  })

  it('adds no pay_basis column and deletes nothing', () => {
    expect(code(migration)).not.toMatch(/pay_basis/i)
    expect(code(migration)).not.toMatch(/\bDELETE\b|\bDROP COLUMN\b|\bDROP TABLE\b/i)
  })

  it('every new column is nullable or defaulted, so today\'s inserts still work', () => {
    expect(code(migration)).toMatch(/ADD COLUMN IF NOT EXISTS created_by UUID;/)
    expect(code(migration)).toMatch(/ADD COLUMN IF NOT EXISTS terms_snapshot JSONB;/)
    expect(code(migration)).toMatch(/ADD COLUMN IF NOT EXISTS delivery_status TEXT;/)
    expect(code(migration)).toMatch(/ADD COLUMN IF NOT EXISTS is_substitution BOOLEAN NOT NULL DEFAULT false;/)
  })
})
