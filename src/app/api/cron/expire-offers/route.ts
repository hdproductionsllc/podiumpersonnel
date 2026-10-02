import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { getNextCandidates } from '@/lib/staffing/candidates'
import { sendOfferExpiredEmail, formatPerformanceDateForSubject } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { getAppUrl } from '@/lib/utils'
import { cronDisabledResponse, requireCronAuth, runCronJob, withCronRetry } from '@/lib/cron'
import { notifySubDeclined } from '@/lib/staffing/respond'
import { LIVE_OFFER_STATUSES } from '@/lib/staffing/live'
import { releaseSeat } from '@/lib/staffing/seats'
import { logEvent, SYSTEM, type StaffingEvent } from '@/lib/staffing/events'
import { advance, autoOfferNote, isAutoCascadeOn } from '@/lib/staffing/cascade'

export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request)
  if (unauthorized) return unauthorized

  const disabled = cronDisabledResponse('expire-offers')
  if (disabled) return disabled

  return runCronJob('expire-offers', async () => {
  const supabase = createServiceClient()
  const baseUrl = getAppUrl()

  // Find all offers that have expired but haven't been marked as such
  const { data: expiredOffers, error: fetchError } = await withCronRetry(
    'expire-offers: fetch expired offers',
    () => supabase
      .from('contract_offers')
      .select(`
        id,
        status,
        project_position_id,
        musician:musicians(
          id,
          first_name,
          last_name,
          email
        ),
        project_position:project_positions(
          id,
          chair_number,
          instrument_id,
          instrument:instruments(id, name),
          project:projects(
            id,
            name,
            organization_id,
            organization:organizations(id, name, timezone),
            services(start_time)
          )
        )
      `)
      .in('status', [...LIVE_OFFER_STATUSES])
      .not('expires_at', 'is', null)
      .lt('expires_at', new Date().toISOString()),
  )

  if (fetchError) {
    // Fatal — let runCronJob report it once (ops alert + Sentry) and 500.
    throw fetchError
  }

  if (!expiredOffers || expiredOffers.length === 0) {
    return NextResponse.json({ expired: 0 })
  }

  let processed = 0
  let emailsSent = 0
  let emailFailures = 0
  // History for the whole run, written in one insert after the loop so a slow
  // database adds at most one LOG_TIMEOUT_MS to the run, not one per offer.
  const runEvents: StaffingEvent[] = []
  // Which organizations have auto-offer on, read once per organization per run.
  const autoCascadeByOrg = new Map<string, boolean>()
  let autoOffered = 0

  try {
    for (let i = 0; i < expiredOffers.length; i++) {
      const offer = expiredOffers[i]
      const musician = offer.musician as any
      const position = offer.project_position as any
      const project = position?.project as any
      const organization = project?.organization as any
      const instrument = position?.instrument as any

      if (!musician || !position || !project) {
        console.warn(`Skipping offer ${offer.id} — missing related data`)
        continue
      }

      const projectServices = (project?.services as any[] || []).sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      const performanceDate = projectServices[0] ? formatPerformanceDateForSubject(projectServices[0].start_time, organization?.timezone) : ''

      // 1. Mark offer as expired — optimistic lock, same pattern as accept/decline:
      // only transition offers still pending/viewed. An offer accepted between the
      // fetch above and this update (a real window — this loop sleeps 600ms per
      // offer) must not be flipped to expired and have its confirmed chair vacated.
      const { data: expiredRows, error: updateError } = await supabase
        .from('contract_offers')
        .update({ status: 'expired' })
        .eq('id', offer.id)
        .in('status', [...LIVE_OFFER_STATUSES])
        .select('id')

      if (updateError) {
        console.error(`Failed to expire offer ${offer.id}:`, updateError)
        continue
      }

      if (!expiredRows || expiredRows.length === 0) {
        // Offer changed state since the fetch (e.g. accepted) — leave it alone
        continue
      }

      processed++

      const events: StaffingEvent[] = []

      // 1a. A substitute's offer running out ends that substitution attempt, the
      // same as a decline does. Without this the request stayed "approved" forever:
      // the original musician could not ask for another sub and was never told.
      const { data: subRequest } = await supabase
        .from('substitution_requests')
        .select(`
          id,
          requesting_musician_id,
          suggested_sub_name,
          requesting_musician:musicians!requesting_musician_id(id, first_name, last_name, email),
          service:services(id, name)
        `)
        .eq('offer_id', offer.id)
        .eq('status', 'approved')
        .maybeSingle()

      if (subRequest) {
        const { data: endedRows, error: subError } = await supabase
          .from('substitution_requests')
          .update({ status: 'sub_declined' })
          .eq('id', subRequest.id)
          .eq('status', 'approved')
          .select('id')

        if (subError) {
          console.error(`Failed to mark substitution request ${subRequest.id} sub_declined after offer ${offer.id} expired:`, subError)
        } else if (endedRows && endedRows.length > 0) {
          events.push({
            organizationId: project.organization_id,
            actor: SYSTEM,
            entityType: 'substitution_request',
            entityId: subRequest.id,
            action: 'substitution.ended',
            before: { status: 'approved' },
            after: { status: 'sub_declined', reason: 'expired', offer_id: offer.id },
          })
          await notifySubDeclined(
            supabase,
            {
              offer,
              subRequest,
              musician,
              position,
              project,
              organization,
              instrument,
              performanceDate,
            },
            'expired'
          )
        }
      }

      // 1b. Reset position — but only if no other active or accepted offer exists.
      // Including 'accepted' protects the substitution flow: when a substitute's
      // pending offer expires, the chair is still held by the original musician's
      // accepted offer and must not be vacated.
      const { data: otherActiveOffers } = await supabase
        .from('contract_offers')
        .select('id')
        .eq('project_position_id', position.id)
        .in('status', [...LIVE_OFFER_STATUSES, 'accepted'])
        .neq('id', offer.id)
        .limit(1)

      // releaseSeat('expired') also requires an empty chair: the check above and this
      // write are separate requests, and a pending offer never seats anyone, so a
      // chair with a musician in it was filled some other way and is not ours to free.
      let seatReleased = false
      if (!otherActiveOffers || otherActiveOffers.length === 0) {
        const seat = await releaseSeat(supabase, position.id, 'expired')

        if (seat.error) {
          console.error(`Failed to reset position ${position.id}:`, seat.error)
        }
        seatReleased = seat.released
      }

      events.unshift({
        organizationId: project.organization_id,
        actor: SYSTEM,
        entityType: 'offer',
        entityId: offer.id,
        action: 'offer.expired',
        before: { status: offer.status },
        after: {
          status: 'expired',
          position_id: position.id,
          seat_released: seatReleased,
          ...(subRequest ? { substitution_request_id: subRequest.id } : {}),
        },
      })
      // 1c. Auto-offer (cascade.ts), for organizations that switched it on. Not
      // for a substitute's offer: the chair is still the original musician's.
      // This expiry's history is written first, so it reads in order; advance()
      // never throws, so one chair's trouble cannot stop the run.
      let autoOffer: ReturnType<typeof autoOfferNote>
      const orgId: string = project.organization_id
      if (!autoCascadeByOrg.has(orgId)) autoCascadeByOrg.set(orgId, await isAutoCascadeOn(supabase, orgId))
      if (!subRequest && autoCascadeByOrg.get(orgId)) {
        await logEvent(events)
        const cascade = await advance(supabase, { positionId: position.id, triggerOfferId: offer.id, trigger: 'expired' })
        if (cascade.outcome === 'offered') autoOffered++
        autoOffer = autoOfferNote(cascade, organization?.timezone)
      } else {
        runEvents.push(...events)
      }

      // 2. Find next candidate (not needed when Podium already acted on it)
      let nextCandidate: { name: string; email: string; callOrder: number | null } | null = null
      if (!autoOffer) {
        const { candidates } = await getNextCandidates(supabase, position.id, 1)
        nextCandidate = candidates.length > 0 && !candidates[0].has_conflict
          ? {
              name: `${candidates[0].first_name} ${candidates[0].last_name}`,
              email: candidates[0].email,
              callOrder: candidates[0].call_order,
            }
          : null
      }

      // 3. Count total chairs for this instrument (for email display)
      let totalChairs = 1
      if (project.id && position.instrument_id) {
        const { count } = await supabase
          .from('project_positions')
          .select('*', { count: 'exact', head: true })
          .eq('project_id', project.id)
          .eq('instrument_id', position.instrument_id)
        totalChairs = count || 1
      }

      // 4. Send email to org admins
      try {
        const adminEmails = await getOrgAdminEmails(project.organization_id)

        if (adminEmails.length > 0) {
          const expiredResult = await sendOfferExpiredEmail({
            to: adminEmails,
            organizationName: organization?.name || 'Your Organization',
            projectName: project.name,
            musicianName: `${musician.first_name} ${musician.last_name}`,
            instrument: instrument?.name || 'Instrument',
            chairNumber: position.chair_number || 1,
            totalChairs,
            nextCandidate,
            dashboardUrl: `${baseUrl}/dashboard/projects?expand=${project.id}`,
            performanceDate,
            ...(autoOffer ? { autoOffer } : {}),
          })
          emailsSent++

          await logEmail({
            organizationId: project.organization_id,
            recipientEmail: adminEmails[0],
            recipientName: undefined,
            subject: expiredResult?.subject || `Offer Expired: ${musician.first_name} ${musician.last_name} - ${project.name}`,
            emailType: 'offer_expired',
            musicianId: musician.id,
            projectId: project.id,
            offerId: offer.id,
            resendEmailId: expiredResult?.id || null,
            metadata: { allRecipients: adminEmails },
            body: expiredResult?.emailHtml,
          })
        }
      } catch (emailError) {
        console.error(`Failed to send expiration email for offer ${offer.id}:`, emailError)
        emailFailures++
      }
    }
  } finally {
    // In finally so offers already expired keep their history even if a later
    // iteration throws.
    await logEvent(runEvents)
  }

  console.log(`Cron: expired ${processed} offers, sent ${emailsSent} notification emails, ${emailFailures} failed${autoOffered ? `, ${autoOffered} offered on automatically` : ''}`)

  return NextResponse.json({
    expired: processed,
    emailsSent,
    emailFailures,
    ...(autoOffered ? { autoOffered } : {}),
  })
  })
}
