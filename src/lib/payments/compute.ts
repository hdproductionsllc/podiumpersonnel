/**
 * What one confirmed musician is owed for one service.
 *
 * The single source of the pay rule, shared by "Generate Payments" (which
 * writes payment rows) and the after-gig pay summary email (which only reports
 * the amounts), so the two can never disagree.
 *
 *   base       = the accepted offer's custom_pay, else the service's base_pay, else 0
 *   leader fee = the service's leader_fee, only for a musician flagged leader,
 *                and only when the base came from the service default. A custom
 *                offer amount was negotiated as the whole fee, leader part included.
 */

export interface OfferForPay {
  custom_pay: number | null
  status: string
}

export interface ServiceForPay {
  base_pay: number | null
  leader_fee: number | null
}

export interface ServicePay {
  basePay: number
  leaderFee: number
  total: number
  /** Leader AND the service has a leader fee (what payments.is_leader_fee records). */
  isLeader: boolean
}

/** The agreed amount on the musician's accepted offer, or null when none. */
export function acceptedOfferPay(offers: OfferForPay[] | null | undefined): number | null {
  const accepted = offers?.find((o) => o.status === 'accepted')
  return accepted?.custom_pay ?? null
}

export function computeServicePay(
  service: ServiceForPay,
  musicianIsLeader: boolean,
  offerPay: number | null,
): ServicePay {
  const basePay = offerPay ?? service.base_pay ?? 0
  const isLeader = musicianIsLeader && !!service.leader_fee
  const leaderFee = (isLeader && offerPay === null && service.leader_fee) ? service.leader_fee : 0
  return { basePay, leaderFee, total: basePay + leaderFee, isLeader }
}
