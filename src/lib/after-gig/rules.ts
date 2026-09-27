/**
 * After the gig: the pure rules (no database, no email), so each can be
 * tested directly.
 *
 * Thirty minutes after a project's LAST service ends, the org's owners and
 * admins get "here is what to pay each person", and every confirmed musician
 * flagged leader on the roster is asked for a short gig report.
 */

import { acceptedOfferPay, computeServicePay, type OfferForPay } from '@/lib/payments/compute'

/** Wait this long after the last service ends: the gig may run a little over. */
export const AFTER_GIG_DELAY_MS = 30 * 60 * 1000

/**
 * Never act on a gig that ended longer ago than this. The cron only looks back
 * this far, so the first deploy (or a long outage) cannot email a summary for
 * every gig in the history of the org.
 */
export const AFTER_GIG_LOOKBACK_MS = 48 * 60 * 60 * 1000

export interface ServiceForAfterGig {
  id: string
  name: string | null
  start_time: string
  end_time: string | null
  base_pay: number | null
  leader_fee: number | null
}

export interface PositionForAfterGig {
  id: string
  status: string
  musician_id: string | null
  instrument?: { name: string | null } | null
  musician?: {
    id: string
    first_name: string | null
    last_name: string | null
    email: string | null
    is_leader: boolean | null
  } | null
  contract_offers?: OfferForPay[] | null
}

/**
 * When the gig is over: the latest end_time (or, for a service with no end
 * time, its start) across the project's services. Null when it has none.
 */
export function gigEndedAt(services: ServiceForAfterGig[] | null | undefined): Date | null {
  let latest: number | null = null
  for (const s of services || []) {
    const t = Date.parse(s.end_time || s.start_time)
    if (!Number.isNaN(t) && (latest === null || t > latest)) latest = t
  }
  return latest === null ? null : new Date(latest)
}

/** True from 30 minutes after the gig ended until the 48-hour lookback closes. */
export function isAfterGigDue(endedAt: Date | null, now: Date): boolean {
  if (!endedAt) return false
  const since = now.getTime() - endedAt.getTime()
  return since >= AFTER_GIG_DELAY_MS && since <= AFTER_GIG_LOOKBACK_MS
}

function fullName(m: { first_name: string | null; last_name: string | null }): string {
  return [m.first_name, m.last_name].filter(Boolean).join(' ').trim() || 'Unnamed'
}

function confirmed(positions: PositionForAfterGig[] | null | undefined) {
  return (positions || []).filter((p) => p.status === 'confirmed' && p.musician_id && p.musician)
}

/**
 * The gig's leads: every CONFIRMED musician whose roster record is flagged
 * leader (David, 2026-09-27: the roster flag, no per-gig choice). A musician
 * confirmed in two chairs is asked once.
 */
export function gigLeads(positions: PositionForAfterGig[] | null | undefined) {
  const seen = new Set<string>()
  const leads: { musicianId: string; name: string; firstName: string; email: string | null }[] = []
  for (const p of confirmed(positions)) {
    const m = p.musician!
    if (!m.is_leader || seen.has(m.id)) continue
    seen.add(m.id)
    leads.push({ musicianId: m.id, name: fullName(m), firstName: m.first_name || '', email: m.email })
  }
  return leads
}

export interface PaySummaryLine {
  musicianId: string
  name: string
  instrument: string
  basePay: number
  leaderFee: number
  total: number
}

/**
 * What each confirmed musician is owed for the whole gig, summed over its
 * services with the same rule Generate Payments uses. One line per chair, so a
 * musician confirmed in two chairs shows both. Largest first, then by name.
 */
export function buildPaySummary(
  services: ServiceForAfterGig[] | null | undefined,
  positions: PositionForAfterGig[] | null | undefined,
): { lines: PaySummaryLine[]; grandTotal: number } {
  const lines: PaySummaryLine[] = []
  for (const p of confirmed(positions)) {
    const m = p.musician!
    const offerPay = acceptedOfferPay(p.contract_offers)
    let basePay = 0
    let leaderFee = 0
    for (const s of services || []) {
      const pay = computeServicePay(s, !!m.is_leader, offerPay)
      basePay += pay.basePay
      leaderFee += pay.leaderFee
    }
    lines.push({
      musicianId: m.id,
      name: fullName(m),
      instrument: p.instrument?.name || '',
      basePay,
      leaderFee,
      total: basePay + leaderFee,
    })
  }
  lines.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  return { lines, grandTotal: lines.reduce((sum, l) => sum + l.total, 0) }
}
