/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendPreGigNotificationEmail } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'
import { cronDisabledResponse } from '@/lib/cron'

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const disabled = cronDisabledResponse('pre-gig-reminders')
  if (disabled) return disabled

  const supabase = createServiceClient()
  const baseUrl = getAppUrl()
  const now = new Date()
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const in72Hours = new Date(now.getTime() + 72 * 60 * 60 * 1000)

  // 1. Expire old drafts where trigger_date has passed
  const { data: expiredRows } = await supabase
    .from('pre_gig_reminders')
    .update({ status: 'expired' })
    .eq('status', 'draft')
    .lt('trigger_date', now.toISOString())
    .select('id')
  const expiredCount = expiredRows?.length ?? 0

  // 2. Find projects with services 24-72h from now
  const { data: upcomingProjects, error: fetchError } = await supabase
    .from('projects')
    .select(`
      id,
      name,
      organization_id,
      status,
      ensemble_type,
      organization:organizations(
        id,
        name,
        timezone,
        email_logo_url,
        email_brand_color,
        email_footer_text
      ),
      services(
        id,
        name,
        start_time,
        venue,
        venue_id,
        venue_details:venues!services_venue_id_fkey(name)
      ),
      project_positions(
        id,
        status,
        musician_id,
        musician:musicians(id, email)
      ),
      gig_detail_sends(id),
      music_sends(id)
    `)
    .eq('status', 'active')

  if (fetchError) {
    console.error('Failed to fetch upcoming projects:', fetchError)
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  let draftsCreated = 0
  let emailsSent = 0

  for (const project of upcomingProjects || []) {
    const services = (project.services as any[]) || []
    if (services.length === 0) continue

    // Find earliest service start_time
    const earliestService = services.reduce((earliest: any, s: any) => {
      const sTime = new Date(s.start_time).getTime()
      const eTime = new Date(earliest.start_time).getTime()
      return sTime < eTime ? s : earliest
    }, services[0])

    const triggerDate = new Date(earliestService.start_time)

    // Check if within 24-72h window
    if (triggerDate.getTime() < in24Hours.getTime() || triggerDate.getTime() > in72Hours.getTime()) {
      continue
    }

    // Count confirmed musicians with emails
    const positions = (project.project_positions as any[]) || []
    const confirmedMusicians = positions.filter(
      (p: any) => p.status === 'confirmed' && p.musician_id && p.musician?.email
    )
    if (confirmedMusicians.length === 0) continue

    // Check if reminder already exists for this project + trigger date
    const { data: existing } = await supabase
      .from('pre_gig_reminders')
      .select('id')
      .eq('project_id', project.id)
      .eq('trigger_date', triggerDate.toISOString())
      .maybeSingle()

    if (existing) continue

    // Create draft reminder
    const { data: reminder, error: insertError } = await supabase
      .from('pre_gig_reminders')
      .insert({
        project_id: project.id,
        organization_id: project.organization_id,
        trigger_date: triggerDate.toISOString(),
        musician_count: confirmedMusicians.length,
      })
      .select('id')
      .single()

    if (insertError || !reminder) {
      console.error(`Failed to create reminder for project ${project.id}:`, insertError)
      continue
    }

    draftsCreated++

    // Email org admins
    try {
      const adminEmails = await getOrgAdminEmails(project.organization_id)
      if (adminEmails.length === 0) continue

      const organization = project.organization as any
      const timezone = organization?.timezone || DEFAULT_TIMEZONE

      const gigDate = triggerDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: timezone,
      })

      const venueName = earliestService.venue_details?.name || earliestService.venue || null
      const gigDetailsSent = ((project.gig_detail_sends as any[]) || []).length > 0
      const musicSent = ((project.music_sends as any[]) || []).length > 0

      const reviewUrl = `${baseUrl}/dashboard/projects?expand=${project.id}&reminder=${reminder.id}`

      const branding = {
        logoUrl: organization?.email_logo_url,
        brandColor: organization?.email_brand_color,
        footerText: organization?.email_footer_text,
      }

      const result = await sendPreGigNotificationEmail({
        to: adminEmails,
        organizationName: organization?.name || 'Your Organization',
        projectName: project.name,
        gigDate,
        venueName,
        musicianCount: confirmedMusicians.length,
        gigDetailsSent,
        musicSent,
        reviewUrl,
        branding,
      })

      await logEmail({
        organizationId: project.organization_id,
        recipientEmail: adminEmails[0],
        recipientName: undefined,
        subject: result?.subject || `Upcoming: ${project.name} is in 2 days - review reminder`,
        emailType: 'pre_gig_notification',
        projectId: project.id,
        resendEmailId: result?.id || null,
        metadata: { reminderId: reminder.id, allRecipients: adminEmails },
        body: result?.emailHtml,
      })

      emailsSent++
    } catch (emailError) {
      console.error(`Failed to send pre-gig notification for project ${project.id}:`, emailError)
    }

    // Rate limit between projects
    if (draftsCreated > 0) await new Promise((r) => setTimeout(r, 600))
  }

  console.log(`Pre-gig cron: ${draftsCreated} drafts created, ${emailsSent} emails sent, ${expiredCount ?? 0} expired`)

  return NextResponse.json({
    draftsCreated,
    emailsSent,
    expired: expiredCount ?? 0,
  })
}
