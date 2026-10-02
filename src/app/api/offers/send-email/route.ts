import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logEmailConfig } from '@/lib/email/client'
import { serverError } from '@/lib/api-helpers'
import { offerEmailSelect, sendOfferEmail } from '@/lib/staffing/offer-email'
import { withScope } from '@/lib/staffing/scope'
import { NO_EMAIL_MESSAGE, supersedeLiveOffers, supersededEvents } from '@/lib/staffing/offers'
import { adminActor, logEvent } from '@/lib/staffing/events'

// LEGACY: emails an offer the browser already inserted. The Send Offer dialog
// and the offers list now call POST /api/positions/[positionId]/offers, which
// creates, emails and supersedes in one place (createOffer). This route stays
// only for a browser tab still running the previous build during a deploy;
// it can be deleted once that window has passed.
//
// It retires the chair's other open offers BEFORE sending, as it always did
// (so a stale tab cannot leave two live offers), using the shared writer, so
// they are now marked 'superseded' rather than 'expired'.
export async function POST(request: NextRequest) {
  console.log('📧 Send email API called')
  logEmailConfig()

  try {
    const supabase = await createClient()

    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { offerId, includeLeaderFee, leaderFeeAmount } = body

    if (!offerId) {
      return NextResponse.json({ error: 'Offer ID is required' }, { status: 400 })
    }

    // Fetch the offer with all related data, and the services its chair works
    const { data: offer, error: offerError } = await withScope((scope) => supabase
      .from('contract_offers')
      .select(offerEmailSelect(scope))
      .eq('id', offerId)
      .single())

    if (offerError || !offer) {
      console.error('Failed to fetch offer:', offerError)
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }

    /* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST embeds */
    const musician = (offer as any).musician
    const position = (offer as any).project_position
    const project = position?.project
    const organization = project?.organization
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // Only the organization's owners and admins send offers (audit R-15: this
    // route used the service role for the supersede with no role check).
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', organization?.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    // Enforce one active offer per chair: retire any OTHER outstanding offers on
    // this position so sending a new call cleanly supersedes the previous one.
    const actor = adminActor(user.id)
    if (position?.id) {
      const superseded = await supersedeLiveOffers(createServiceClient(), position.id, { exceptOfferId: offerId })

      if (superseded.error) {
        // Sending anyway would leave two live offers on one chair — stop here.
        return serverError(`Failed to expire prior offers on position ${position.id} before sending offer ${offerId}`, superseded.error)
      }

      if (superseded.offers.length > 0) {
        await logEvent(supersededEvents(superseded, { organizationId: organization?.id, actor, positionId: position.id, replacedBy: offerId }))
      }
    }

    const sent = await sendOfferEmail(
      supabase,
      {
        offer,
        musician,
        position,
        project,
        organization,
        instrument: position?.instrument,
        services: project?.services || [],
      },
      { includeLeaderFee, leaderFeeAmount }
    )

    // Check if musician has an email
    if (sent.delivery === 'no_email') {
      return NextResponse.json({ error: NO_EMAIL_MESSAGE }, { status: 400 })
    }

    const suppressed = sent.delivery === 'suppressed'

    await logEvent({
      organizationId: organization?.id,
      actor,
      entityType: 'offer',
      entityId: offerId,
      action: 'offer.sent',
      after: {
        status: 'pending',
        position_id: position?.id ?? null,
        musician_id: musician.id,
        expires_at: offer.expires_at,
        delivery: sent.delivery,
      },
    })

    if (suppressed) {
      return NextResponse.json({
        success: true,
        emailSent: false,
        suppressed: true,
        message: 'Email suppressed by safe mode — offer created but nothing was sent',
      })
    }

    return NextResponse.json({ success: true, emailSent: true, suppressed: false })
  } catch (error) {
    console.error('Failed to send offer email:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send email' },
      { status: 500 }
    )
  }
}
