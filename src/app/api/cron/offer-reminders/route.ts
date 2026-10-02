import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendOfferReminderEmail, sendOfferExpiringSoonEmail, formatPerformanceDateForSubject } from '@/lib/email/send'
import { notify } from '@/lib/notify'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'
import { cronDisabledResponse, requireCronAuth, runCronJob, withCronRetry } from '@/lib/cron'
import { isDueForReminder, reminderHorizon } from '@/lib/staffing/reminders'
import { servicesFor, withScope } from '@/lib/staffing/scope'

export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request)
  if (unauthorized) return unauthorized

  const disabled = cronDisabledResponse('offer-reminders')
  if (disabled) return disabled

  return runCronJob('offer-reminders', async () => {
  const supabase = createServiceClient()
  const baseUrl = getAppUrl()

  const now = new Date()

  // Open offers not yet reminded whose deadline is close enough to be due
  // (src/lib/staffing/reminders.ts: the last 12 hours, and past the halfway
  // point of the offer's own response window). This runs hourly.
  const { data: candidates, error: fetchError } = await withCronRetry(
    'offer-reminders: fetch expiring offers',
    () => withScope((scope) => supabase
      .from('contract_offers')
      .select(`
        id,
        status,
        sent_at,
        expires_at,
        reminder_sent_at,
        token,
        custom_pay,
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
          instrument_id${scope},
          instrument:instruments(id, name),
          project:projects(
            id,
            name,
            organization_id,
            organization:organizations(
              id,
              name,
              timezone,
              email_logo_url,
              email_brand_color,
              email_footer_text
            ),
            services(id, start_time)
          )
        )
      `)
      .in('status', ['pending', 'viewed'])
      .not('expires_at', 'is', null)
      .gt('expires_at', now.toISOString())
      .lte('expires_at', reminderHorizon(now).toISOString())
      .is('reminder_sent_at', null)),
  )

  if (fetchError) {
    throw fetchError
  }

  // Quiet hours are the organization's local time (reminders.ts).
  const orgTimezone = (position: unknown) =>
    (position as { project?: { organization?: { timezone?: string | null } | null } | null } | null)?.project?.organization?.timezone
  const expiringOffers = (candidates || []).filter((offer) =>
    isDueForReminder(offer, now, orgTimezone(offer.project_position) || DEFAULT_TIMEZONE)
  )

  if (!expiringOffers || expiringOffers.length === 0) {
    return NextResponse.json({ reminded: 0 })
  }

  let musicianEmails = 0
  let adminEmails = 0
  let emailFailures = 0

  for (let i = 0; i < expiringOffers.length; i++) {
    const offer = expiringOffers[i]
    const musician = offer.musician as any
    const position = offer.project_position as any
    const project = position?.project as any
    const organization = project?.organization as any
    const instrument = position?.instrument as any

    if (!musician || !position || !project) {
      console.warn(`Skipping offer ${offer.id} — missing related data`)
      continue
    }

    // Claim this offer atomically BEFORE sending, so an overlapping cron run
    // can't send the musician a duplicate reminder. Only one run wins the claim.
    const { data: claimed, error: claimError } = await supabase
      .from('contract_offers')
      .update({ reminder_sent_at: now.toISOString() })
      .eq('id', offer.id)
      .is('reminder_sent_at', null)
      .select('id')

    if (claimError) {
      // Treated as "not claimed": sending without the stamp would risk a
      // duplicate reminder from the next run, so skip and let it retry.
      console.error(`Failed to claim offer ${offer.id} for reminder:`, claimError)
      continue
    }

    if (!claimed || claimed.length === 0) {
      continue // another run already claimed and is sending this reminder
    }

    const projectServices = servicesFor(position, project?.services as any[] || []).sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    const performanceDate = projectServices[0] ? formatPerformanceDateForSubject(projectServices[0].start_time, organization?.timezone) : ''

    const hoursRemaining = Math.round(
      (new Date(offer.expires_at!).getTime() - now.getTime()) / (1000 * 60 * 60)
    )
    const daysRemaining = Math.ceil(hoursRemaining / 24)

    // Count total chairs for this instrument
    let totalChairs = 1
    if (project.id && position.instrument_id) {
      const { count } = await supabase
        .from('project_positions')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .eq('instrument_id', position.instrument_id)
      totalChairs = count || 1
    }

    const branding = {
      logoUrl: organization?.email_logo_url,
      brandColor: organization?.email_brand_color,
      footerText: organization?.email_footer_text,
    }

    // 1. Send reminder to musician
    if (musician.email) {
      try {
        const responseUrl = `${baseUrl}/gig/${offer.token}`
        await notify(
          {
            type: 'offer_reminder_auto',
            record: (r) => ({
              organizationId: project.organization_id,
              recipientEmail: musician.email,
              recipientName: `${musician.first_name} ${musician.last_name}`,
              subject: r?.subject || `Reminder: ${project.name} - response needed`,
              emailType: 'offer_reminder_auto',
              musicianId: musician.id,
              projectId: project.id,
              offerId: offer.id,
              resendEmailId: r?.id || null,
              body: r?.emailHtml,
            }),
          },
          {
            email: () =>
              sendOfferReminderEmail({
                to: musician.email,
                musicianName: musician.first_name,
                organizationName: organization?.name || 'Orchestra',
                organizationId: organization?.id,
                projectName: project.name,
                instrument: instrument?.name || 'Instrument',
                chairNumber: position.chair_number || 1,
                totalChairs,
                responseUrl,
                expiresAt: offer.expires_at,
                daysRemaining,
                performanceDate,
                branding,
              }),
          }
        )

        musicianEmails++
      } catch (emailError) {
        console.error(`Failed to send reminder to musician ${musician.email}:`, emailError)
        emailFailures++
      }
    }

    // 2. Send heads-up to org admins
    try {
      const adminEmailList = await getOrgAdminEmails(project.organization_id)

      if (adminEmailList.length > 0) {
        await notify(
          {
            type: 'offer_expiring_soon',
            record: (r) => ({
              organizationId: project.organization_id,
              recipientEmail: adminEmailList[0],
              recipientName: undefined,
              subject: r?.subject || `Offer expiring soon: ${musician.first_name} ${musician.last_name} - ${project.name}`,
              emailType: 'offer_expiring_soon',
              musicianId: musician.id,
              projectId: project.id,
              offerId: offer.id,
              resendEmailId: r?.id || null,
              metadata: { allRecipients: adminEmailList },
              body: r?.emailHtml,
            }),
          },
          {
            email: () =>
              sendOfferExpiringSoonEmail({
                to: adminEmailList,
                organizationName: organization?.name || 'Your Organization',
                projectName: project.name,
                musicianName: `${musician.first_name} ${musician.last_name}`,
                instrument: instrument?.name || 'Instrument',
                chairNumber: position.chair_number || 1,
                totalChairs,
                hoursRemaining,
                dashboardUrl: `${baseUrl}/dashboard/projects?expand=${project.id}`,
                performanceDate,
              }),
          }
        )

        adminEmails++
      }
    } catch (emailError) {
      console.error(`Failed to send admin heads-up for offer ${offer.id}:`, emailError)
      emailFailures++
    }

    // reminder_sent_at was already stamped atomically when we claimed the offer above.
  }

  console.log(`Cron: sent ${musicianEmails} musician reminders, ${adminEmails} admin heads-ups, ${emailFailures} failed`)

  return NextResponse.json({
    offersProcessed: expiringOffers.length,
    musicianEmails,
    adminEmails,
    emailFailures,
  })
  })
}
