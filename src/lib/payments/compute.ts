/**
 * What one confirmed musician is owed for a gig.
 *
 * The single source of the pay rule, shared by "Generate Payments" (which
 * writes payment rows) and the after-gig pay summary email (which only reports
 * the amounts), so the two can never disagree.
 *
 *   An accepted offer with an amount (custom_pay): that amount is the agreed
 *     fee for the WHOLE gig, however many services it has, leader part
 *     included. It is owed once, recorded against the gig's first service.
 *   No amount on the offer: each service's own base_pay, plus its leader_fee
 *     for a musician flagged leader. These are set per service, so they are
 *     owed per service.
 *
 * The offer amount used to be applied to every service, so a $300 offer on a
 * gig with a rehearsal and a performance generated $600 while the musician had
 * been shown $300.
 */

export interface OfferForPay {
  custom_pay: number | null
  status: string
  /** Who the offer went to; needed to tell the chair holder's offers from other musicians'. */
  musician_id?: string | null
  sent_at?: string | null
  /** What the admin chose when sending (migration 093; null on older offers). */
  terms_snapshot?: { pay?: { include_leader_fee?: boolean | null; leader_fee_amount?: number | null } | null } | null
}

export interface ServiceForPay {
  id: string
  start_time?: string | null
  base_pay: number | null
  leader_fee: number | null
}

/** One payment row's worth: what is owed against one service. */
export interface PayLine {
  serviceId: string
  basePay: number
  leaderFee: number
  total: number
  /** Leader AND the service has a leader fee (what payments.is_leader_fee records). */
  isLeader: boolean
  /** True when this line is the offer's whole-gig amount rather than a service rate. */
  wholeGig: boolean
}

/**
 * The offer that states a confirmed chair holder's deal.
 *
 * Their accepted offer on the chair when there is one. Otherwise the latest
 * offer they were sent for it, whatever its status: a musician who says yes
 * by text after the deadline is assigned by hand, and that lapsed offer is
 * the only record of the amount they were told (Garik, Sutton Ceremony: a
 * $250 offer marked expired, then "—" in the Pay column and no pay on the
 * payments page). Assigning now marks such an offer accepted (assign route),
 * so this fallback covers chairs filled before that.
 *
 * Without a holder id (older callers) it is any accepted offer on the chair,
 * as before; a chair never holds two.
 */
export function chairHolderOffer<O extends OfferForPay>(
  offers: O[] | null | undefined,
  holderMusicianId?: string | null,
): O | null {
  const own = holderMusicianId
    ? (offers || []).filter((o) => o.musician_id === holderMusicianId)
    : offers || []
  const accepted = own.find((o) => o.status === 'accepted')
  if (accepted) return accepted
  if (!holderMusicianId) return null
  return own.reduce<O | null>(
    (latest, o) => (!latest || (o.sent_at ?? '') > (latest.sent_at ?? '') ? o : latest),
    null,
  )
}

/** The agreed amount on the chair holder's offer (chairHolderOffer), or null when none. */
export function acceptedOfferPay(
  offers: OfferForPay[] | null | undefined,
  holderMusicianId?: string | null,
): number | null {
  return chairHolderOffer(offers, holderMusicianId)?.custom_pay ?? null
}

/**
 * Whether the musician's accepted whole-gig amount includes a leader fee, which
 * is what labels their payment "Leader Fee" rather than "Service Pay".
 *
 * Offers sent since migration 093 record the admin's leader-fee checkbox, and
 * that is the answer. Older offers did not record it, so the gig's lead stands
 * in (the admin's pick, else Violin 1 chair 1: see gigLead in after-gig/rules).
 * musicians.is_leader is NOT used: it says someone CAN lead, not that they led
 * this gig or were paid for it (it labelled a violist's pay "Leader Fee").
 */
export function acceptedOfferIncludesLeaderFee(
  offers: OfferForPay[] | null | undefined,
  isGigLead: boolean,
  holderMusicianId?: string | null,
): boolean {
  const recorded = chairHolderOffer(offers, holderMusicianId)?.terms_snapshot?.pay?.include_leader_fee
  return typeof recorded === 'boolean' ? recorded : isGigLead
}

/** The gig's first service by start time (input order breaks ties and missing times). */
function firstService<S extends ServiceForPay>(services: S[]): S {
  return services.reduce((first, s) =>
    s.start_time && (!first.start_time || s.start_time < first.start_time) ? s : first
  )
}

/**
 * The lines one musician is owed for a gig. Empty when there are no services.
 * Lines can total zero (no rate set anywhere); callers decide whether to skip them.
 *
 * `services` are the services the musician's chair works: servicesFor(position,
 * gig services) (src/lib/staffing/scope.ts). For a chair on the whole gig that
 * is every service, as before. For a chair limited to some, the per-service
 * rates are owed for those only, and a whole-gig amount is owed once, against
 * the first service the chair works.
 */
export function computeGigPay(
  services: ServiceForPay[] | null | undefined,
  musicianIsLeader: boolean,
  offerPay: number | null,
  /** Only for a whole-gig amount: see acceptedOfferIncludesLeaderFee. */
  offerIncludesLeaderFee = false,
): PayLine[] {
  if (!services || services.length === 0) return []

  if (offerPay !== null) {
    const first = firstService(services)
    return [{
      serviceId: first.id,
      basePay: offerPay,
      leaderFee: 0,
      total: offerPay,
      isLeader: offerIncludesLeaderFee,
      wholeGig: true,
    }]
  }

  return services.map((service) => {
    const basePay = service.base_pay ?? 0
    const isLeader = musicianIsLeader && !!service.leader_fee
    const leaderFee = isLeader ? service.leader_fee! : 0
    return { serviceId: service.id, basePay, leaderFee, total: basePay + leaderFee, isLeader, wholeGig: false }
  })
}
