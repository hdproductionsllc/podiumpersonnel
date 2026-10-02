import { MockSupabaseDb, type Row } from './supabase-mock'

/**
 * The quartet regression fixture ("do not break the business"), target
 * architecture section 7.1.
 *
 * A string-quartet wedding: one project, two services (Ceremony, Cocktail
 * Hour), four chairs (Violin 1, Violin 2, Viola, Cello) and a ranked call list
 * of three musicians per chair. It is the business Podium runs today, so a
 * refactor that changes what this scenario produces has broken something.
 *
 * The fixture is a seeded MockSupabaseDb plus two admin shortcuts that write
 * the rows directly, for tests about what happens AFTER an offer exists:
 *
 *   quartet.sendOffer('v1', 'mus-v1-a')   what createOffer leaves behind
 *   quartet.sendNext('v2')                "send to next in line": the admin's click
 *
 * Offer creation itself is a route now (POST /api/positions/[id]/offers,
 * createOffer); offers-route.test.ts drives it for real. Everything a musician
 * or a cron does is left to the real route handlers.
 *
 * The in-memory fake does not interpret PostgREST embeds (see supabase-mock.ts),
 * so `hydrate()` rebuilds the nested shapes the routes select (offer.musician,
 * offer.project_position.project.services, position.contract_offers, ...) from
 * the base rows. Call it before invoking a route; sendOffer does it for you.
 */

export const QUARTET_ORG = { id: 'org-quartet', name: 'Test Quartet Co', timezone: 'America/Chicago' }

export const QUARTET_PROJECT = {
  id: 'proj-wedding',
  name: 'Smith Wedding',
  organization_id: QUARTET_ORG.id,
  status: 'active',
  ensemble_type: 'quartet',
  description: null,
  start_date: '2026-11-07',
  end_date: '2026-11-07',
}

/** Leader fee is set on the Ceremony only, so "leader fee on V1" shows up as one line. */
export const QUARTET_SERVICES: Row[] = [
  { id: 'svc-ceremony', project_id: QUARTET_PROJECT.id, name: 'Ceremony', start_time: '2026-11-07T21:00:00Z', base_pay: 150, leader_fee: 50 },
  { id: 'svc-cocktail', project_id: QUARTET_PROJECT.id, name: 'Cocktail Hour', start_time: '2026-11-07T22:30:00Z', base_pay: 100, leader_fee: null },
]

export const QUARTET_INSTRUMENTS = [
  { id: 'inst-violin', name: 'Violin' },
  { id: 'inst-viola', name: 'Viola' },
  { id: 'inst-cello', name: 'Cello' },
]

export type ChairKey = 'v1' | 'v2' | 'viola' | 'cello'

export const QUARTET_CHAIRS: Record<ChairKey, { id: string; instrument_id: string; chair_number: number }> = {
  v1: { id: 'pos-v1', instrument_id: 'inst-violin', chair_number: 1 },
  v2: { id: 'pos-v2', instrument_id: 'inst-violin', chair_number: 2 },
  viola: { id: 'pos-viola', instrument_id: 'inst-viola', chair_number: 1 },
  cello: { id: 'pos-cello', instrument_id: 'inst-cello', chair_number: 1 },
}

/** The ranked call list per chair, best first. */
export const QUARTET_RANKING: Record<ChairKey, string[]> = {
  v1: ['mus-v1-a', 'mus-v1-b', 'mus-v1-c'],
  v2: ['mus-v2-a', 'mus-v2-b', 'mus-v2-c'],
  viola: ['mus-viola-a', 'mus-viola-b', 'mus-viola-c'],
  cello: ['mus-cello-a', 'mus-cello-b', 'mus-cello-c'],
}

/** Only the Violin 1 candidates are flagged leaders (is_leader = "can lead"). */
function quartetMusicians(): Row[] {
  const rows: Row[] = []
  for (const key of Object.keys(QUARTET_RANKING) as ChairKey[]) {
    QUARTET_RANKING[key].forEach((id, i) => {
      rows.push({
        id,
        organization_id: QUARTET_ORG.id,
        first_name: `${key.toUpperCase()}${'ABC'[i]}`,
        last_name: 'Player',
        email: `${id}@example.com`,
        user_id: null,
        is_active: true,
        is_leader: key === 'v1',
        call_order: i + 1,
      })
    })
  }
  return rows
}

export interface SendOfferOptions {
  /** Whole-gig fee agreed on the offer; null leaves each service on its own rate. */
  customPay?: number | null
  /** ISO timestamp; null is "No expiration". Defaults to 48 hours from now. */
  expiresAt?: string | null
  /**
   * Retire the chair's other live offers as 'superseded', as createOffer does.
   * Pass false to build the two-live-offers state the audit calls R-1 (before
   * createOffer, an offer sent with the email toggle off left it behind).
   */
  supersede?: boolean
}

export class QuartetFixture {
  readonly db: MockSupabaseDb
  private offerSeq = 0

  constructor() {
    this.db = new MockSupabaseDb({
      projects: [{ ...QUARTET_PROJECT }],
      services: QUARTET_SERVICES.map((s) => ({ ...s })),
      instruments: QUARTET_INSTRUMENTS.map((i) => ({ ...i })),
      musicians: quartetMusicians(),
      project_positions: (Object.keys(QUARTET_CHAIRS) as ChairKey[]).map((key) => ({
        ...QUARTET_CHAIRS[key],
        project_id: QUARTET_PROJECT.id,
        musician_id: null,
        status: 'vacant',
      })),
      contract_offers: [],
      substitution_requests: [],
      payments: [],
      musician_instruments: [],
      organization_members: [{ id: 'mem-admin', user_id: 'user-admin', organization_id: QUARTET_ORG.id, role: 'owner' }],
    })
    this.hydrate()
  }

  // -- reads ---------------------------------------------------------------

  chair(key: ChairKey): Row {
    return this.db.row('project_positions', QUARTET_CHAIRS[key].id)!
  }

  /** Every offer ever made on the chair, oldest first. */
  offers(key: ChairKey): Row[] {
    return this.db.tables.contract_offers.filter((o) => o.project_position_id === QUARTET_CHAIRS[key].id)
  }

  /** Offers any reader in the app counts as live. */
  liveOffers(key: ChairKey): Row[] {
    return this.offers(key).filter((o) => ['pending', 'viewed'].includes(o.status))
  }

  offerFor(key: ChairKey, musicianId: string): Row {
    const offer = this.offers(key).find((o) => o.musician_id === musicianId)
    if (!offer) throw new Error(`no offer for ${musicianId} on ${key}`)
    return offer
  }

  /**
   * Who the admin would be shown as next in line: the first ranked musician
   * with no offer of any kind on this chair (declined, expired and rescinded
   * all count as having had their turn) and not seated elsewhere on the gig.
   */
  nextInLine(key: ChairKey): string | null {
    const seated = new Set(this.db.tables.project_positions.map((p) => p.musician_id).filter(Boolean))
    const tried = new Set(this.offers(key).map((o) => o.musician_id))
    return QUARTET_RANKING[key].find((id) => !tried.has(id) && !seated.has(id)) ?? null
  }

  // -- admin actions that live in the browser -------------------------------

  /** The rows createOffer leaves: the new offer, the chair offered, earlier offers superseded. */
  sendOffer(key: ChairKey, musicianId: string, opts: SendOfferOptions = {}): Row {
    const positionId = QUARTET_CHAIRS[key].id
    const offerId = `offer-${++this.offerSeq}`
    const expiresAt =
      opts.expiresAt === undefined ? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() : opts.expiresAt

    if (opts.supersede !== false) {
      for (const other of this.liveOffers(key)) {
        other.status = 'superseded'
        other.responded_at = new Date().toISOString()
      }
    }

    this.db.tables.contract_offers.push({
      id: offerId,
      token: `tok-${offerId}`,
      status: 'pending',
      project_position_id: positionId,
      musician_id: musicianId,
      sent_at: new Date().toISOString(),
      expires_at: expiresAt,
      responded_at: null,
      viewed_at: null,
      response_notes: null,
      custom_pay: opts.customPay ?? null,
      personal_message: null,
    })

    // The dialog flips the chair to "offered" unless someone already confirmed it.
    const position = this.chair(key)
    if (position.status !== 'confirmed') position.status = 'offered'

    this.hydrate()
    return this.db.row('contract_offers', offerId)!
  }

  /** "Send to next in line": the admin's click. Returns null when the list is exhausted. */
  sendNext(key: ChairKey, opts: SendOfferOptions = {}): Row | null {
    const next = this.nextInLine(key)
    return next ? this.sendOffer(key, next, opts) : null
  }

  // -- embeds ----------------------------------------------------------------

  /** Rebuild every PostgREST embed the cascade routes select from the base rows. */
  hydrate(): void {
    const t = this.db.tables
    const byId = (table: string, id: unknown) => t[table]?.find((r) => r.id === id) ?? null
    const services = [...t.services].sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))
    const project = (): Row => {
      const p = byId('projects', QUARTET_PROJECT.id)!
      return { ...p, organization: QUARTET_ORG, services }
    }
    const positionEmbed = (positionId: unknown): Row => {
      const pos = byId('project_positions', positionId)!
      return {
        id: pos.id,
        chair_number: pos.chair_number,
        instrument_id: pos.instrument_id,
        musician_id: pos.musician_id,
        instrument: byId('instruments', pos.instrument_id),
        project: project(),
      }
    }

    for (const offer of t.contract_offers) {
      offer.musician = byId('musicians', offer.musician_id)
      offer.project_position = positionEmbed(offer.project_position_id)
    }

    for (const pos of t.project_positions) {
      pos.projects = project()
      pos.project = project()
      pos.instrument = byId('instruments', pos.instrument_id)
      pos.musician = pos.musician_id ? byId('musicians', pos.musician_id) : null
      pos.contract_offers = t.contract_offers
        .filter((o) => o.project_position_id === pos.id)
        .map((o) => ({ custom_pay: o.custom_pay ?? null, status: o.status }))
    }

    for (const request of t.substitution_requests) {
      request.requesting_musician = byId('musicians', request.requesting_musician_id)
      request.service = request.service_id ? byId('services', request.service_id) : null
      request.project_position = positionEmbed(request.project_position_id)
    }
  }
}

/** A fresh quartet gig: four vacant chairs, nobody offered anything yet. */
export function buildQuartet(): QuartetFixture {
  return new QuartetFixture()
}
