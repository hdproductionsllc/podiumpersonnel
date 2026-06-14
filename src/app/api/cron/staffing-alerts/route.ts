/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendStaffingAlertEmail } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'
import { cronDisabledResponse } from '@/lib/cron'

// Alert thresholds in days — one email per project per threshold
const THRESHOLDS = [14, 7, 3]

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const disabled = cronDisabledResponse('staffing-alerts')
  if (disabled) return disabled

  const supabase = createServiceClient()
  const baseUrl = getAppUrl()
  const now = new Date()

  // Fetch active projects with upcoming services and their positions
  const { data: projects, error: fetchError } = await supabase
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
        chair_number,
        instrument:instruments(name)
      )
    `)
    .eq('status', 'active')

  if (fetchError) {
    console.error('Staffing alerts: failed to fetch projects:', fetchError)
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  let emailsSent = 0
  let skipped = 0

  for (const project of projects || []) {
    const services = (project.services as any[]) || []
    const positions = (project.project_positions as any[]) || []

    if (services.length === 0 || positions.length === 0) continue

    // Find earliest upcoming service
    const upcomingServices = services.filter(
      (s: any) => new Date(s.start_time).getTime() > now.getTime()
    )
    if (upcomingServices.length === 0) continue

    const earliestService = upcomingServices.reduce((earliest: any, s: any) => {
      return new Date(s.start_time).getTime() < new Date(earliest.start_time).getTime() ? s : earliest
    }, upcomingServices[0])

    const gigTime = new Date(earliestService.start_time).getTime()
    const daysAway = Math.floor((gigTime - now.getTime()) / (1000 * 60 * 60 * 24))

    // Only alert within our threshold windows (up to 14 days out)
    if (daysAway > THRESHOLDS[0] || daysAway < 0) continue

    // Find which threshold we're at (use the tightest matching threshold)
    const threshold = THRESHOLDS.find((t) => daysAway <= t)
    if (!threshold) continue

    // Skip if org has opted out of staffing alerts
    const organization = project.organization as any
    if (organization?.disable_staffing_alerts) {
      skipped++
      continue
    }

    // Check for unfilled positions
    const unfilled = positions.filter(
      (p: any) => p.status !== 'confirmed'
    )
    if (unfilled.length === 0) continue // Fully staffed, no alert needed

    const confirmedCount = positions.length - unfilled.length

    // Deduplicate: check if we already sent a staffing_alert for this project + threshold
    const { data: existingLog } = await supabase
      .from('email_logs')
      .select('id')
      .eq('email_type', 'staffing_alert')
      .eq('project_id', project.id)
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
      const result = await sendStaffingAlertEmail({
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
      })

      await logEmail({
        organizationId: project.organization_id,
        recipientEmail: adminEmails[0],
        subject: result?.subject || `Staffing Alert: ${project.name} - ${unfilled.length} unfilled positions`,
        emailType: 'staffing_alert',
        projectId: project.id,
        resendEmailId: result?.id || null,
        metadata: {
          threshold,
          daysAway,
          unfilledCount: unfilled.length,
          totalPositions: positions.length,
          allRecipients: adminEmails,
        },
        body: result?.emailHtml,
      })

      emailsSent++
    } catch (emailError) {
      console.error(`Staffing alert failed for project ${project.id}:`, emailError)
    }

    // Rate limit between sends
    if (emailsSent > 0) await new Promise((r) => setTimeout(r, 600))
  }

  console.log(`Staffing alerts: ${emailsSent} sent, ${skipped} skipped (already notified)`)

  return NextResponse.json({ emailsSent, skipped })
}
