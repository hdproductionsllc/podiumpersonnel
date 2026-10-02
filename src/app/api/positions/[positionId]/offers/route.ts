import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createOffer } from '@/lib/staffing/offers'
import { parseOfferExpiry } from '@/lib/staffing/expiry'

// Admin sends a chair to a musician: creates the offer, emails it (unless
// asked not to) and retires the chair's previous open offer. The rules live in
// createOffer (src/lib/staffing/offers.ts); this only reads the request.
//
// Body: { musicianId, expiry?, customPay?, personalMessage?, sendEmail?,
//         includeLeaderFee?, leaderFeeAmount? }
// 200:  { success, offerId, delivery, emailError?, superseded }
//       delivery = sent | suppressed | failed | no_email | not_requested
// 4xx/5xx: { error, code }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ positionId: string }> }
) {
  try {
    const { positionId } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body.musicianId !== 'string' || !body.musicianId) {
      return NextResponse.json({ error: 'musicianId is required', code: 'invalid' }, { status: 400 })
    }

    const expiry = body.expiry === undefined ? undefined : parseOfferExpiry(body.expiry)
    if (expiry === null) {
      return NextResponse.json({ error: 'Invalid response deadline', code: 'invalid' }, { status: 400 })
    }

    const customPay = body.customPay == null || body.customPay === '' ? null : Number(body.customPay)
    if (customPay !== null && (!Number.isFinite(customPay) || customPay < 0)) {
      return NextResponse.json({ error: 'Invalid pay amount', code: 'invalid' }, { status: 400 })
    }

    const result = await createOffer(supabase, user.id, {
      positionId,
      musicianId: body.musicianId,
      expiry,
      customPay,
      personalMessage: typeof body.personalMessage === 'string' ? body.personalMessage : null,
      sendEmail: body.sendEmail !== false,
      includeLeaderFee: body.includeLeaderFee ?? null,
      leaderFeeAmount: body.leaderFeeAmount ?? null,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
    }

    return NextResponse.json({
      success: true,
      offerId: result.offerId,
      delivery: result.delivery,
      ...(result.emailError ? { emailError: result.emailError } : {}),
      superseded: result.superseded,
    })
  } catch (error) {
    console.error('Failed to create offer:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create offer', code: 'failed' },
      { status: 500 }
    )
  }
}
