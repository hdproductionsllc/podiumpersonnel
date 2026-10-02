/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendStaffingAlertEmail } from '@/lib/email/send'
import { notify } from '@/lib/notify'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'
import { cronDisabledResponse, requireCronAuth, runCronJob, withCronRetry } from '@/lib/cron'
import { staffingAlertThreshold } from '@/lib/projects/staffing-alerts'
import { servicesFor, withScope } from '@/lib/staffing/scope'

export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request)
  if (unauthorized) return unauthorized

  const disabled = cronDisabledResponse('staffing-alerts')
  if (disabled) return disabled

  return runCronJob('staffing-alerts', async () => {
  const supabase = createServiceClient()
  const baseUrl = getAppUrl()
  const now = new Date()

  // Fetch active projects with upcoming services and their positions (with
  // which services each chair works: scope.ts)
  const { data: projects, error: fetchError } = await withCronRetry(
    'staffing-alerts: fetch active projects',
    () => withScope((scope) => supabase
      .from('projects')
      .select(`
        id,
        name,
        organization_id,
        organization:organizations(
          id,
          name,
          timezone,
          disable_staffing_alerts,
          email_logo_url,
          email_brand_color,
          email_footer_text
        ),
        services(
          id,
          start_time,
          venue,
          venue_id,
          venue_details:venues!services_venue_id_fkey(name)
        ),
        project_positions(
          id,
          status,
          chair_number${scope},
          instrument:instruments(name)
        )
      `)
      .eq('status', 'active')),
  )

  if (fetchError) {
    throw fetchError
  }

  let emailsSent = 0
  let skipped = 0
  let emailFailures = 0

  for (const project of projects || []) {
    const services = (project.services as any[]) || []
    const projectPositions = (project.project_positions as any[]) || []

    if (services.length === 0 || projectPositions.length === 0) continue

    // Find earliest upcoming service
    const upcomingServices = services.filter(
      (s: any) => new Date(s.start_time).getTime() > now.getTime()
    )
    if (upcomingServices.length === 0) continue

    // The chairs this alert is about: those with a service still ahead. Every
    // chair works every service unless it is limited to some (scope.ts), so
    // that is every chair; a chair limited to calls already over (or to none)
    // has nothing left to staff.
    const positions = projectPositions.filter((p: any) => servicesFor(p, upcomingServices).length > 0)

    // Unfilled chairs, and the earliest call one of them still has to work:
    // with every chair on every service, the gig's next service, as before.
    const unfilled = positions.filter(
      (p: any) => p.status !== 'confirmed'
    )
    const urgentServices = unfilled.length > 0
      ? unfilled.flatMap((p: any) => servicesFor(p, upcomingServices))
      : upcomingServices

    const earliestService = urgentServices.reduce((earliest: any, s: any) => {
      return new Date(s.start_time).getTime() < new Date(earliest.start_time).getTime() ? s : earliest
    }, urgentServices[0])

    const gigTime = new Date(earliestService.start_time).getTime()
    const daysAway = Math.floor((gigTime - now.getTime()) / (1000 * 60 * 60 * 24))

    // Only alert within a threshold window, using the tightest one that applies
    const threshold = staffingAlertThreshold(daysAway)
    if (threshold === null) continue

    // Skip if org has opted out of staffing alerts
    const organization = project.organization as any
    if (organization?.disable_staffing_alerts) {
      skipped++
      continue
    }

    // Check for unfilled positions
    if (unfilled.length === 0) continue // Fully staffed, no alert needed

    const confirmedCount = positions.length - unfilled.length

    // Deduplicate: check if we already sent a staffing_alert for this project + threshold.
    // A send the provider refused is on record too (status 'failed', notify) but
    // was never sent, so it must not stop the next run from trying again.
    const { data: existingLog } = await supabase
      .from('email_logs')
      .select('id')
      .eq('email_type', 'staffing_alert')
      .eq('project_id', project.id)
      .neq('status', 'failed')
      .filter('metadata->>threshold', 'eq', String(threshold))
      .limit(1)
      .maybeSingle()

    if (existingLog) {
      skipped++
      continue
    }

    // Get org admin emails
    const adminEmails = await getOrgAdminEmails(project.organization_id)
    if (adminEmails.length === 0) continue

    const timezone = organization?.timezone || DEFAULT_TIMEZONE

    const gigDate = new Date(earliestService.start_time).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: timezone,
    })

    const venueName = earliestService.venue_details?.name || earliestService.venue || null

    const unfilledPositions = unfilled.map((p: any) => ({
      instrument: (p.instrument as any)?.name || 'Unknown',
      chairNumber: p.chair_number,
      status: p.status as 'vacant' | 'offered' | 'declined',
    }))

    const dashboardUrl = `${baseUrl}/dashboard/projects?expand=${project.id}`

    const branding = {
      logoUrl: organization?.email_logo_url,
      brandColor: organization?.email_brand_color,
      footerText: organization?.email_footer_text,
    }

    try {
      await notify(
        {
          type: 'staffing_alert',
          record: (r) => ({
            organizationId: project.organization_id,
            recipientEmail: adminEmails[0],
            subject: r?.subject || `Staffing Alert: ${project.name} - ${unfilled.length} unfilled positions`,
            emailType: 'staffing_alert',
            projectId: project.id,
            resendEmailId: r?.id || null,
            metadata: {
              threshold,
              daysAway,
              unfilledCount: unfilled.length,
              totalPositions: positions.length,
              allRecipients: adminEmails,
            },
            body: r?.emailHtml,
          }),
        },
        {
          email: () =>
            sendStaffingAlertEmail({
              to: adminEmails,
              organizationName: organization?.name || 'Your Organization',
              projectName: project.name,
              gigDate,
              venueName,
              daysAway,
              totalPositions: positions.length,
              confirmedCount,
              unfilledPositions,
              dashboardUrl,
              branding,
            }),
        }
      )

      emailsSent++
    } catch (emailError) {
      console.error(`Staffing alert failed for project ${project.id}:`, emailError)
      emailFailures++
    }
  }

  console.log(`Staffing alerts: ${emailsSent} sent, ${skipped} skipped (already notified), ${emailFailures} failed`)

  return NextResponse.json({ emailsSent, skipped, emailFailures })
  })
}
