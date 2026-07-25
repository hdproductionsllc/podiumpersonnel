/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  sendMusicianReleasedEmail,
  sendSubDeclinedFindAnotherEmail,
} from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { getAppUrl } from '@/lib/utils'

/**
 * Shared offer-response logic for the two paths a musician can answer on:
 *
 *   - the emailed link  → /api/gig/[token]/{accept,decline}      (no login)
 *   - the portal        → /api/musician/offers/[id]/{accept,decline}
 *
 * Both routes were ~300-line near-copies of each other, and they had already
 * drifted: the portal path logged the substitution emails (musician_released,
 * sub_declined) while the token path sent them without logging. Since most
 * musicians answer from the emailed link, the effect was that a "you've been
 * released" notice usually never appeared in the contractor's email log — so a
 * musician saying "nobody told me" could not be checked against a record.
 *
 * Keeping the seat claim here matters even more than the logging: it is the
 * only thing preventing two musicians from winning the same chair, and two
 * copies of it is two chances to get it wrong.
 */

/** Statuses an offer can still be answered from. */
export const RESPONDABLE_STATUSES = ['pending', 'viewed'] as const

export type ClaimResult =
  /** The offer was accepted and the chair is now held by this musician. */
  | { outcome: 'claimed' }
  /** Someone already accepted/declined this offer, or it was rescinded. */
  | { outcome: 'already_responded' }
  /** The offer was claimed but the chair had gone to someone else; offer reverted. */
  | { outcome: 'position_filled' }
  | { outcome: 'error'; error: unknown }

/** How many chairs this instrument has on this project (for "2 of 4" wording). */
export async function countChairs(
  supabase: SupabaseClient,
  projectId?: string,
  instrumentId?: string
): Promise<number> {
  if (!projectId || !instrumentId) return 1

  const { count } = await supabase
    .from('project_positions')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('instrument_id', instrumentId)

  return count || 1
}

/**
 * Atomically accept an offer and claim its chair.
 *
 * Two conditional updates, in this order, are what make a double-book
 * impossible without a transaction:
 *
 *   1. contract_offers  ... WHERE status IN ('pending','viewed')
 *      Only one concurrent request can move the offer out of a respondable
 *      state; the loser gets zero rows back.
 *   2. project_positions ... WHERE musician_id IS NULL   (normal offer)
 *                        ... WHERE musician_id = <original>  (substitution)
 *      The chair is claimed only if still free — or, for a substitution,
 *      transferred only if still held by the musician being replaced.
 *
 * If step 2 finds nothing the chair went to someone else in between, so the
 * offer is reverted to pending rather than left falsely accepted.
 */
export async function claimChairForAccept(
  supabase: SupabaseClient,
  offer: { id: string; project_position_id: string; musician_id: string },
  subRequest: { requesting_musician_id: string } | null
): Promise<ClaimResult> {
  const { data: updatedOffer, error: offerError } = await supabase
    .from('contract_offers')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', offer.id)
    .in('status', RESPONDABLE_STATUSES as unknown as string[])
    .select('id')

  if (offerError) return { outcome: 'error', error: offerError }
  if (!updatedOffer || updatedOffer.length === 0) return { outcome: 'already_responded' }

  let positionUpdate = supabase
    .from('project_positions')
    .update({ musician_id: offer.musician_id, status: 'confirmed' })
    .eq('id', offer.project_position_id)

  positionUpdate = subRequest
    ? positionUpdate.eq('musician_id', subRequest.requesting_musician_id)
    : positionUpdate.is('musician_id', null)

  const { data: updatedPosition, error: positionError } = await positionUpdate.select('id')

  if (positionError) return { outcome: 'error', error: positionError }

  if (!updatedPosition || updatedPosition.length === 0) {
    // Chair is no longer available to this musician — undo the acceptance so the
    // offer does not sit "accepted" against a chair someone else holds.
    await supabase
      .from('contract_offers')
      .update({ status: 'pending', responded_at: null })
      .eq('id', offer.id)

    return { outcome: 'position_filled' }
  }

  return { outcome: 'claimed' }
}

/**
 * Atomically decline an offer. The same optimistic lock as the accept path, so
 * a stale decline cannot clobber an acceptance that landed first.
 */
export async function markOfferDeclined(
  supabase: SupabaseClient,
  offer: { id: string },
  /**
   * The musician's reason, when the UI collected one. The portal has a notes
   * field; the emailed link does not, and passing undefined leaves whatever is
   * already on the row rather than overwriting it with null.
   */
  responseNotes?: string | null
): Promise<'declined' | 'already_responded' | 'error'> {
  const update: Record<string, unknown> = {
    status: 'declined',
    responded_at: new Date().toISOString(),
  }
  if (responseNotes !== undefined) update.response_notes = responseNotes

  const { data, error } = await supabase
    .from('contract_offers')
    .update(update)
    .eq('id', offer.id)
    .in('status', RESPONDABLE_STATUSES as unknown as string[])
    .select('id')

  if (error) {
    console.error(`Failed to decline offer ${offer.id}:`, error)
    return 'error'
  }

  return !data || data.length === 0 ? 'already_responded' : 'declined'
}

/** Free a chair so the contractor can offer it to someone else. */
export async function vacateChair(
  supabase: SupabaseClient,
  projectPositionId: string
): Promise<void> {
  await supabase
    .from('project_positions')
    .update({ musician_id: null, status: 'vacant' })
    .eq('id', projectPositionId)
}

/** Context both substitution notifications need, gathered once by the caller. */
export type SubstitutionContext = {
  offer: any
  subRequest: any
  musician: any
  position: any
  project: any
  organization: any
  instrument: any
  performanceDate: string
}

/**
 * A substitute accepted: tell the original musician they are released, and
 * record it. Sending without logging is what the token path used to do.
 */
export async function notifyMusicianReleased(
  supabase: SupabaseClient,
  ctx: SubstitutionContext
): Promise<void> {
  const { offer, subRequest, musician, position, project, organization, instrument } = ctx
  const originalMusician = subRequest?.requesting_musician
  if (!originalMusician?.email) return

  const totalChairs = await countChairs(supabase, project?.id, instrument?.id)

  try {
    const result = await sendMusicianReleasedEmail({
      to: originalMusician.email,
      musicianName: `${originalMusician.first_name} ${originalMusician.last_name}`,
      organizationName: organization?.name || 'Orchestra',
      organizationId: organization?.id,
      projectName: project?.name || 'Project',
      instrument: instrument?.name || 'Instrument',
      chairNumber: position?.chair_number || 1,
      totalChairs,
      serviceName: subRequest?.service?.name || null,
      substituteName: `${musician?.first_name} ${musician?.last_name}`,
      performanceDate: ctx.performanceDate,
    }).catch((err) => {
      console.warn('Failed to send musician released email:', err)
      return null
    })

    if (result && project?.organization_id) {
      await logEmail({
        organizationId: project.organization_id,
        recipientEmail: originalMusician.email,
        recipientName: `${originalMusician.first_name} ${originalMusician.last_name}`,
        subject: result.subject,
        emailType: 'musician_released',
        musicianId: originalMusician.id,
        projectId: project.id,
        offerId: offer.id,
        resendEmailId: result.id || null,
        body: result.emailHtml,
      })
    }
  } catch (emailError) {
    console.warn('Email sending failed:', emailError)
  }
}

/**
 * A substitute declined: tell the original musician they still need to find
 * cover, and record it. Links back to their own gig page so they can try again.
 */
export async function notifySubDeclined(
  supabase: SupabaseClient,
  ctx: SubstitutionContext
): Promise<void> {
  const { offer, subRequest, musician, position, project, organization, instrument } = ctx
  const originalMusician = subRequest?.requesting_musician
  if (!originalMusician?.email) return

  const totalChairs = await countChairs(supabase, project?.id, instrument?.id)

  // The original musician's own accepted offer, so the email can link them back
  // to their gig page rather than the bare app root.
  const { data: originalOffer } = await supabase
    .from('contract_offers')
    .select('token')
    .eq('project_position_id', offer.project_position_id)
    .eq('musician_id', subRequest.requesting_musician_id)
    .eq('status', 'accepted')
    .maybeSingle()

  const baseUrl = getAppUrl()

  try {
    const result = await sendSubDeclinedFindAnotherEmail({
      to: originalMusician.email,
      musicianName: `${originalMusician.first_name} ${originalMusician.last_name}`,
      organizationName: organization?.name || 'Orchestra',
      organizationId: organization?.id,
      projectName: project?.name || 'Project',
      instrument: instrument?.name || 'Instrument',
      chairNumber: position?.chair_number || 1,
      totalChairs,
      serviceName: subRequest?.service?.name || null,
      suggestedSubName:
        subRequest.suggested_sub_name || `${musician?.first_name} ${musician?.last_name}`,
      gigUrl: originalOffer ? `${baseUrl}/gig/${originalOffer.token}` : baseUrl,
      performanceDate: ctx.performanceDate,
    }).catch((err) => {
      console.warn('Failed to send sub declined email:', err)
      return null
    })

    if (result && project?.organization_id) {
      await logEmail({
        organizationId: project.organization_id,
        recipientEmail: originalMusician.email,
        recipientName: `${originalMusician.first_name} ${originalMusician.last_name}`,
        subject: result.subject,
        emailType: 'sub_declined',
        musicianId: originalMusician.id,
        projectId: project.id,
        offerId: offer.id,
        resendEmailId: result.id || null,
        body: result.emailHtml,
      })
    }
  } catch (emailError) {
    console.warn('Email sending failed:', emailError)
  }
}
