/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  sendMusicianReleasedEmail,
  sendSubDeclinedFindAnotherEmail,
} from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { getAppUrl } from '@/lib/utils'
import { LIVE_OFFER_STATUSES } from './live'
import { MIGRATION_094_MISSING, isMissingFunction } from './rpc'

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
 * Keeping the seat claim here matters even more than the logging: it is what
 * stops two musicians winning the same chair (now in the database, through
 * claim_chair), and two copies of it is two chances to get it wrong.
 */

/**
 * Statuses an offer can still be answered from. The same list as
 * LIVE_OFFER_STATUSES (src/lib/staffing/live.ts); the old name stays for callers.
 */
export const RESPONDABLE_STATUSES = LIVE_OFFER_STATUSES

/**
 * Whether an offer that is still pending can actually be answered. Cancelling
 * or completing a project, or deactivating a musician, does not touch their
 * offers, so without this check a musician could accept a cancelled gig and be
 * emailed "Confirmed". The gig page uses the same rule to show the offer as
 * closed instead of offering buttons that would be refused.
 */
export function isOfferClosed(
  project: { status?: string | null } | null | undefined,
  musician: { is_active?: boolean | null } | null | undefined
): boolean {
  return (
    project?.status === 'cancelled' ||
    project?.status === 'completed' ||
    musician?.is_active === false
  )
}

export type ClaimResult =
  /** The offer was accepted and the chair is now held by this musician. */
  | { outcome: 'claimed' }
  /** The offer is gone, already answered or withdrawn, or past its deadline. */
  | { outcome: 'already_responded' }
  /** The chair had gone to someone else; the offer was retired as superseded. */
  | { outcome: 'position_filled' }
  /** The gig was cancelled or completed in the meantime; nothing changed. */
  | { outcome: 'project_inactive' }
  /** The musician was deactivated in the meantime; nothing changed. */
  | { outcome: 'musician_inactive' }
  | { outcome: 'error'; error: unknown }

const CLAIM_OUTCOMES = ['claimed', 'already_responded', 'position_filled', 'project_inactive', 'musician_inactive'] as const

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
 * Accept an offer and claim its chair: the claim_chair database function
 * (migration 094), one transaction that locks the chair, then the offer.
 *
 * It replaced two conditional updates issued one after the other (offer, then
 * chair, with a revert when the chair turned out to be taken). Those were
 * race-safe for two plain offers, but a substitute's accept wrote their
 * 'accepted' before the original's 'released', a failed revert left an offer
 * accepted against a chair someone else held, and the loser of a race went
 * back to 'pending' and was offered Accept again (audit R-11). In the function:
 *
 *   - a normal offer takes the chair only while it is empty; a substitute's
 *     only while the musician they replace still holds it, and that musician's
 *     accepted offer is released first;
 *   - an offer that lost the chair is retired as 'superseded' (and a losing
 *     substitute's request closed), never put back;
 *   - any other open offer on the chair is retired once it is filled;
 *   - a cancelled/completed gig or a deactivated musician changes nothing;
 *   - every change is written to staffing_events in the same transaction.
 *
 * Whether the offer is a substitute's is decided inside the function, from the
 * approved substitution request that points at it. If the function is missing
 * (094 not pasted), the accept is refused and nothing changes (see rpc.ts).
 */
export async function claimChairForAccept(
  supabase: SupabaseClient,
  offer: { id: string }
): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc('claim_chair', { p_offer_id: offer.id })

  if (error) {
    if (isMissingFunction(error)) {
      console.error(`Accept of offer ${offer.id} refused, nothing changed: ${MIGRATION_094_MISSING}`)
    }
    return { outcome: 'error', error }
  }
  if ((CLAIM_OUTCOMES as readonly unknown[]).includes(data)) {
    return { outcome: data as (typeof CLAIM_OUTCOMES)[number] } as ClaimResult
  }
  return { outcome: 'error', error: new Error(`claim_chair returned an unknown outcome: ${String(data)}`) }
}

/**
 * Atomically decline an offer: a conditional update on the offer's status, so
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
 * A substitute fell through: tell the original musician they still need to find
 * cover, and record it. Links back to their own gig page so they can try again.
 * `reason` keeps the email truthful: a sub who let the offer run out did not
 * decline it.
 */
export async function notifySubDeclined(
  supabase: SupabaseClient,
  ctx: SubstitutionContext,
  reason: 'declined' | 'expired' = 'declined'
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
      reason,
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
