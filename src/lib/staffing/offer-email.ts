import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrgAdminEmails } from '@/lib/supabase/server'
import { sendContractOfferEmail, sendAdminOfferSentEmail } from '@/lib/email/send'
import { notify } from '@/lib/notify'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'
import { getVenueName, getVenueMapsUrl, getVenueAddress } from '@/lib/venue-helpers'
import { attachVenueDetails } from '@/lib/venue-attach'

/**
 * The offer email: the musician's "Call" email plus the admins' "Offer Sent"
 * copy. Moved here unchanged from /api/offers/send-email so the new offer route
 * (createOffer) and the old one send the very same email: same pay lines, same
 * leader-fee rule, same safe-mode handling, same email log.
 *
 * Pay and leader-fee wording are NOT decided here beyond what the old route
 * did; do not change them without David (see payments/compute.ts).
 */

/** The embeds the email needs, as the old send-email route selected them. */
export const OFFER_EMAIL_SELECT = `
        id,
        token,
        expires_at,
        custom_pay,
        personal_message,
        musician:musicians(
          id,
          first_name,
          last_name,
          email
        ),
        project_position:project_positions(
          id,
          chair_number,
          instrument:instruments(id, name),
          project:projects(
            id,
            name,
            ensemble_type,
            organization:organizations(id, name, timezone, email_logo_url, email_brand_color, email_footer_text),
            services(id, name, service_type, call_time, start_time, end_time, venue, venue_id, base_pay, leader_fee, venue_2, venue_id_2)
          )
        )
      `

export { OFFER_EMAIL_ORG_FIELDS, OFFER_EMAIL_SERVICE_FIELDS } from './offer-email-fields'

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST embeds, typed as the route always did */
export interface OfferEmailInput {
  offer: { id: string; token: string; expires_at: string | null; custom_pay: number | null; personal_message?: string | null }
  musician: any
  position: any
  project: any
  organization: any
  instrument: any
  services: any[]
}

/** What the dialog sent about the leader fee. Absent = the old route's default. */
export interface LeaderFeeChoice {
  includeLeaderFee?: boolean | null
  leaderFeeAmount?: number | string | null
}

export type OfferEmailResult =
  /** Sent, or blocked by safe mode (nothing left the building). */
  | { delivery: 'sent' | 'suppressed'; payAmount: number | null }
  /** The musician has no address on file: nothing was attempted. */
  | { delivery: 'no_email' }

/**
 * Send the offer email for an offer that already exists. Throws when the
 * email provider fails (the caller decides what that means for the offer).
 */
export async function sendOfferEmail(
  supabase: SupabaseClient,
  input: OfferEmailInput,
  { includeLeaderFee: explicitLeaderFee, leaderFeeAmount: explicitLeaderFeeAmount }: LeaderFeeChoice = {}
): Promise<OfferEmailResult> {
  const { offer, musician, position, project, organization, instrument, services } = input
  const offerId = offer.id
  const timezone = organization?.timezone || DEFAULT_TIMEZONE

  await attachVenueDetails(services)

  // Calculate pay
  const chairNumber = position?.chair_number || 1
  const firstService = services.length > 0 ? services[0] : null
  const basePay = firstService?.base_pay ?? null
  const hasCustomPay = (offer as any).custom_pay != null

  // Leader fee logic: only include if explicitly requested from the dialog.
  // When custom_pay is set, the pay was already finalized at offer creation time —
  // don't guess based on chair number, or the email will incorrectly show a leader fee breakdown.
  const isLeader = explicitLeaderFee != null ? !!explicitLeaderFee : (!hasCustomPay && chairNumber === 1)
  const leaderFee = explicitLeaderFeeAmount != null ? Number(explicitLeaderFeeAmount) : (firstService?.leader_fee ?? 0)
  const payAmount = hasCustomPay
    ? Number((offer as any).custom_pay)
    : basePay != null
      ? basePay + (isLeader ? leaderFee : 0)
      : null

  // Count total chairs for this instrument in this project
  let totalChairs = 1
  if (project?.id && instrument?.id) {
    const { count } = await supabase
      .from('project_positions')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .eq('instrument_id', instrument.id)
    totalChairs = count || 1
  }

  // Check if musician has an email
  if (!musician?.email) {
    return { delivery: 'no_email' }
  }

  // Build the response URL
  const baseUrl = getAppUrl()
  const responseUrl = `${baseUrl}/gig/${offer.token}`

  // Format services for the email
  const formattedServices = services
    .sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .map((service: any) => ({
      name: service.name,
      date: new Date(service.start_time).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: timezone,
      }),
      callTime: service.call_time
        ? new Date(service.call_time).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: timezone,
          })
        : null,
      time: new Date(service.start_time).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: timezone,
      }),
      endTime: service.end_time
        ? new Date(service.end_time).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: timezone,
          })
        : null,
      venue: getVenueName(service),
      venueUrl: getVenueMapsUrl(service),
      venueAddress: getVenueAddress(service),
      venue2: service.venue_2_details || service.venue_2 ? getVenueName({ venue: service.venue_2, venue_details: service.venue_2_details }) : null,
      venue2Url: service.venue_2_details || service.venue_2 ? getVenueMapsUrl({ venue: service.venue_2, venue_details: service.venue_2_details }) : null,
      venue2Address: service.venue_2_details ? getVenueAddress({ venue_details: service.venue_2_details }) : null,
    }))

  // Send the email
  console.log('📧 Attempting to send email to:', musician.email)
  console.log('📧 Email params:', {
    to: musician.email,
    musicianName: `${musician.first_name} ${musician.last_name}`,
    organizationName: organization?.name,
    projectName: project?.name,
    instrument: instrument?.name,
  })

  // Sent through notify(): it writes the audit row (below, as it always read)
  // and records a refused send as failed before rethrowing it.
  const result = await notify(
    {
      type: 'contract_offer',
      record: (r) => {
        const suppressed = r?.suppressed === true
        return {
          organizationId: organization?.id,
          recipientEmail: musician.email,
          recipientName: `${musician.first_name} ${musician.last_name}`,
          subject: r?.subject || `Call: ${project?.name} - ${instrument?.name}`,
          emailType: 'contract_offer',
          musicianId: musician.id,
          projectId: project?.id,
          offerId: offerId,
          resendEmailId: r?.id || null,
          status: suppressed ? 'suppressed' : 'sent',
          metadata: {
            instrument: instrument?.name,
            chairNumber: position?.chair_number,
            payAmount,
            ensembleType: project?.ensemble_type,
            ...(suppressed ? { suppressedRecipients: r?.suppressedRecipients || [musician.email] } : {}),
          },
          body: r?.emailHtml,
        }
      },
    },
    {
      email: () =>
        sendContractOfferEmail({
          to: musician.email,
          musicianName: `${musician.first_name} ${musician.last_name}`,
          organizationName: organization?.name || 'Orchestra',
          organizationId: organization?.id,
          projectName: project?.name || 'Project',
          instrument: instrument?.name || 'Instrument',
          chairNumber: position?.chair_number || 1,
          totalChairs,
          services: formattedServices,
          responseUrl,
          expiresAt: offer.expires_at,
          timezone,
          payAmount,
          leaderFee: isLeader ? leaderFee : null,
          isLeader,
          personalMessage: (offer as any).personal_message || undefined,
          ensembleType: project?.ensemble_type || null,
          branding: {
            logoUrl: organization?.email_logo_url,
            brandColor: organization?.email_brand_color,
            footerText: organization?.email_footer_text,
          },
        }),
    }
  )

  // A suppressed send is NOT a success shape: safe mode blocked every
  // recipient (id: null, no Resend call made). Logging it as 'sent' and
  // telling the dialog to say "Call sent!" is exactly the bug this guards
  // against — the offer row sits pending with no email ever delivered.
  const suppressed = result?.suppressed === true

  console.log(
    suppressed
      ? '📧 Email suppressed by safe mode (not sent):'
      : '📧 Email sent successfully:',
    result
  )

  // A suppressed send never reached the musician, so an admin "Offer Sent"
  // notification would be the same false-positive one layer up. Skip it.
  if (!suppressed) {
    try {
      const adminEmails = await getOrgAdminEmails(organization?.id)

      if (adminEmails.length > 0) {
        const baseUrl = getAppUrl()
        await notify(
          {
            type: 'admin_offer_sent',
            recordSent: false,
            record: () => ({
              organizationId: organization?.id,
              recipientEmail: adminEmails[0],
              subject: `Offer Sent: ${musician.first_name} ${musician.last_name} - ${project?.name || 'Project'}`,
              emailType: 'admin_offer_sent',
              musicianId: musician.id,
              projectId: project?.id,
              offerId,
              metadata: { allRecipients: adminEmails },
            }),
          },
          {
            email: () =>
              sendAdminOfferSentEmail({
                to: adminEmails,
                organizationName: organization?.name || 'Orchestra',
                projectName: project?.name || 'Project',
                musicianName: `${musician.first_name} ${musician.last_name}`,
                musicianEmail: musician.email,
                instrument: instrument?.name || 'Instrument',
                chairNumber: position?.chair_number || 1,
                totalChairs,
                services: formattedServices,
                dashboardUrl: `${baseUrl}/dashboard/projects`,
                payAmount,
                leaderFee: isLeader ? leaderFee : null,
                isLeader,
                personalMessage: (offer as any).personal_message || null,
                expiresAt: offer.expires_at,
                ensembleType: project?.ensemble_type || null,
                timezone,
              }),
          }
        ).catch((err) => console.warn('Failed to send admin notification:', err))
        console.log('📧 Admin notification sent to:', adminEmails)
      } else {
        console.log('📧 No admin emails found for organization')
      }
    } catch (adminEmailError) {
      console.warn('Failed to send admin notification:', adminEmailError)
      // Don't fail the request if admin notification fails
    }
  }

  return { delivery: suppressed ? 'suppressed' : 'sent', payAmount }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
