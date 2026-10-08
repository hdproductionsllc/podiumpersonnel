import { describe, it, expect } from 'vitest'
import { acceptedOfferIncludesLeaderFee, acceptedOfferPay, chairHolderOffer } from '@/lib/payments/compute'

/**
 * A confirmed chair holder's pay comes from THEIR offer on the chair: the
 * accepted one, else the latest they were sent. Garik (Sutton Ceremony,
 * 2026-10-08) was assigned by hand three days after his $250 offer lapsed; the
 * Pay column and the payments page read only accepted offers and showed "—".
 */

const garik = 'mus-garik'
const other = 'mus-other'

const expired250 = { id: 'o1', musician_id: garik, status: 'expired', custom_pay: 250, sent_at: '2026-09-20T18:22:41Z' }
const declined300 = { id: 'o0', musician_id: other, status: 'declined', custom_pay: 300, sent_at: '2026-09-17T18:33:04Z' }

describe('chairHolderOffer', () => {
  it('prefers the holder\'s accepted offer', () => {
    const accepted = { id: 'o2', musician_id: garik, status: 'accepted', custom_pay: 275, sent_at: '2026-09-01T00:00:00Z' }
    expect(chairHolderOffer([expired250, accepted, declined300], garik)).toBe(accepted)
  })

  it('falls back to the latest offer the holder was sent, whatever its status', () => {
    const older = { id: 'o3', musician_id: garik, status: 'declined', custom_pay: 200, sent_at: '2026-08-01T00:00:00Z' }
    expect(chairHolderOffer([older, declined300, expired250], garik)).toBe(expired250)
  })

  it('never reads another musician\'s offer as the holder\'s', () => {
    expect(chairHolderOffer([declined300], garik)).toBeNull()
  })

  it('without a holder id is any accepted offer on the chair, as before', () => {
    const accepted = { id: 'o2', musician_id: other, status: 'accepted', custom_pay: 275 }
    expect(chairHolderOffer([expired250, accepted])).toBe(accepted)
    expect(chairHolderOffer([expired250])).toBeNull()
  })
})

describe('acceptedOfferPay / acceptedOfferIncludesLeaderFee', () => {
  it('Garik: $250 from the expired offer he was assigned on', () => {
    expect(acceptedOfferPay([declined300, expired250], garik)).toBe(250)
  })

  it('no offer to the holder: null, so the service rates apply', () => {
    expect(acceptedOfferPay([declined300], garik)).toBeNull()
    expect(acceptedOfferPay([], garik)).toBeNull()
    expect(acceptedOfferPay(null, garik)).toBeNull()
  })

  it('reads the leader-fee choice off the holder\'s offer, else the gig lead', () => {
    const withChoice = { ...expired250, terms_snapshot: { pay: { include_leader_fee: true } } }
    expect(acceptedOfferIncludesLeaderFee([declined300, withChoice], false, garik)).toBe(true)
    expect(acceptedOfferIncludesLeaderFee([declined300, expired250], true, garik)).toBe(true)
    expect(acceptedOfferIncludesLeaderFee([declined300, expired250], false, garik)).toBe(false)
  })
})
