/**
 * After the gig: the pure rules (no database, no email), so each can be
 * tested directly.
 *
 * Thirty minutes after a project's LAST service ends, the org's owners and
 * admins get "here is what to pay each person", and the gig's ONE lead is
 * asked for a short gig report.
 */

import { acceptedOfferPay, computeGigPay, type OfferForPay } from '@/lib/payments/compute'
import { servicesFor, type PositionScope } from '@/lib/staffing/scope'
import { isViolinOne, VIOLIN_ONE_LEAD } from '@/lib/verticals/defaults'
import type { LeadFallbackSkill } from '@/lib/verticals/types'

export { isViolinOne }

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

export interface PositionForAfterGig extends PositionScope {
  id: string
  status: string
  musician_id: string | null
  chair_number?: number | null
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

export interface GigLead {
  musicianId: string
  name: string
  firstName: string
  email: string | null
}

/**
 * Who leads THIS gig. There is exactly one (David, 2026-09-27).
 *
 *   'chosen'    an admin named the lead (projects.gig_lead_musician_id) and
 *               that musician is confirmed on the gig
 *   'violin-1'  nobody was named: the person confirmed in the vertical's
 *               lead skill (`fallback`; music: Violin 1), lowest chair ("the
 *               leader of the gig is usually violin 1")
 *   'needs-pick' nobody named and nobody confirmed in that skill, or the
 *               vertical has none (production_crew): an admin must pick,
 *               and nobody is asked for a report until they do
 *
 * musicians.is_leader is deliberately NOT used: it means someone CAN lead,
 * never that they lead this gig.
 */
export function gigLead(
  positions: PositionForAfterGig[] | null | undefined,
  chosenMusicianId: string | null | undefined,
  fallback: LeadFallbackSkill | null = VIOLIN_ONE_LEAD,
): { lead: GigLead | null; source: 'chosen' | 'violin-1' | 'needs-pick' } {
  const seated = confirmed(positions)
  const toLead = (m: NonNullable<PositionForAfterGig['musician']>): GigLead => ({
    musicianId: m.id,
    name: fullName(m),
    firstName: m.first_name || '',
    email: m.email,
  })

  const chosen = chosenMusicianId ? seated.find((p) => p.musician!.id === chosenMusicianId) : undefined
  if (chosen) return { lead: toLead(chosen.musician!), source: 'chosen' }

  const violinOne = fallback
    ? seated
        .filter((p) => fallback.matches(p.instrument?.name))
        .sort((a, b) => (a.chair_number ?? 99) - (b.chair_number ?? 99))[0]
    : undefined
  if (violinOne) return { lead: toLead(violinOne.musician!), source: 'violin-1' }

  return { lead: null, source: 'needs-pick' }
}

/**
 * Why a gig has no lead, for the "pick the gig lead" notice on the gig page.
 * Music: "Nobody is confirmed in Violin 1", as it always said; a vertical
 * where no role leads by default (production_crew): nobody was picked.
 */
export function noLeadReason(fallback: LeadFallbackSkill | null): string {
  return fallback ? `Nobody is confirmed in ${fallback.label}` : 'No gig lead was picked'
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
 * What each confirmed musician is owed for the whole gig, with the same rule
 * Generate Payments uses (an offer amount once, else each service's rate),
 * over the services their chair works (servicesFor: every service unless the
 * chair is limited to some). One line per chair, so a musician confirmed in
 * two chairs shows both. Largest first, then by name.
 */
export function buildPaySummary(
  services: ServiceForAfterGig[] | null | undefined,
  positions: PositionForAfterGig[] | null | undefined,
): { lines: PaySummaryLine[]; grandTotal: number } {
  const lines: PaySummaryLine[] = []
  for (const p of confirmed(positions)) {
    const m = p.musician!
    const offerPay = acceptedOfferPay(p.contract_offers, m.id)
    let basePay = 0
    let leaderFee = 0
    for (const pay of computeGigPay(servicesFor(p, services), !!m.is_leader, offerPay)) {
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
