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

/** The agreed amount on the musician's accepted offer, or null when none. */
export function acceptedOfferPay(offers: OfferForPay[] | null | undefined): number | null {
  const accepted = offers?.find((o) => o.status === 'accepted')
  return accepted?.custom_pay ?? null
}

/** The gig's first service by start time (input order breaks ties and missing times). */
function firstService<S extends ServiceForPay>(services: S[]): S {
  return services.reduce((first, s) =>
    s.start_time && (!first.start_time || s.start_time < first.start_time) ? s : first
  )
}

/**
 * The lines one musician is owed for a gig. Empty when the gig has no services.
 * Lines can total zero (no rate set anywhere); callers decide whether to skip them.
 */
export function computeGigPay(
  services: ServiceForPay[] | null | undefined,
  musicianIsLeader: boolean,
  offerPay: number | null,
): PayLine[] {
  if (!services || services.length === 0) return []

  if (offerPay !== null) {
    const first = firstService(services)
    return [{
      serviceId: first.id,
      basePay: offerPay,
      leaderFee: 0,
      total: offerPay,
      isLeader: musicianIsLeader && !!first.leader_fee,
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
