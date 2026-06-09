import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendOfferReminderEmail, sendOfferExpiringSoonEmail, formatPerformanceDateForSubject } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { getAppUrl } from '@/lib/utils'
import { cronDisabledResponse, notifyOps } from '@/lib/cron'

export async function GET(request: NextRequest) {
  // Verify cron secret — Vercel sets this automatically for cron jobs
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const disabled = cronDisabledResponse('offer-reminders')
  if (disabled) return disabled

  const supabase = createServiceClient()
  const baseUrl = getAppUrl()

  const now = new Date()
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  // Find offers expiring within the next 24 hours that haven't been reminded yet
  const { data: expiringOffers, error: fetchError } = await supabase
    .from('contract_offers')
    .select(`
      id,
      expires_at,
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
        instrument_id,
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
          services(start_time)
        )
      )
    `)
    .in('status', ['pending', 'viewed'])
    .not('expires_at', 'is', null)
    .gt('expires_at', now.toISOString())
    .lte('expires_at', in24Hours.toISOString())
    .is('reminder_sent_at', null)

  if (fetchError) {
    console.error('Failed to fetch expiring offers:', fetchError)
    await notifyOps('offer-reminders', fetchError)
    return NextResponse.json({ error: 'Failed to fetch expiring offers' }, { status: 500 })
  }

  if (!expiringOffers || expiringOffers.length === 0) {
    return NextResponse.json({ reminded: 0 })
  }

  let musicianEmails = 0
  let adminEmails = 0

  for (let i = 0; i < expiringOffers.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 600))
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
    const { data: claimed } = await supabase
      .from('contract_offers')
      .update({ reminder_sent_at: now.toISOString() })
      .eq('id', offer.id)
      .is('reminder_sent_at', null)
      .select('id')

    if (!claimed || claimed.length === 0) {
      continue // another run already claimed and is sending this reminder
    }

    const projectServices = (project?.services as any[] || []).sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
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
        const result = await sendOfferReminderEmail({
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
        })

        await logEmail({
          organizationId: project.organization_id,
          recipientEmail: musician.email,
          recipientName: `${musician.first_name} ${musician.last_name}`,
          subject: `⚠️ URGENT: Reminder: Call for ${project.name}`,
          emailType: 'offer_reminder_auto',
          musicianId: musician.id,
          projectId: project.id,
          offerId: offer.id,
          resendEmailId: result?.id || null,
          body: result?.emailHtml,
        })

        musicianEmails++
      } catch (emailError) {
        console.error(`Failed to send reminder to musician ${musician.email}:`, emailError)
      }
    }

    // 2. Send heads-up to org admins
    try {
      const adminEmailList = await getOrgAdminEmails(project.organization_id)

      if (adminEmailList.length > 0) {
        const adminResult = await sendOfferExpiringSoonEmail({
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
        })

        await logEmail({
          organizationId: project.organization_id,
          recipientEmail: adminEmailList[0],
          recipientName: undefined,
          subject: `⚠️ Offer Expiring: ${musician.first_name} ${musician.last_name} — ${project.name}`,
          emailType: 'offer_expiring_soon',
          musicianId: musician.id,
          projectId: project.id,
          offerId: offer.id,
          resendEmailId: adminResult?.id || null,
          metadata: { allRecipients: adminEmailList },
          body: adminResult?.emailHtml,
        })

        adminEmails++
      }
    } catch (emailError) {
      console.error(`Failed to send admin heads-up for offer ${offer.id}:`, emailError)
    }

    // reminder_sent_at was already stamped atomically when we claimed the offer above.
  }

  console.log(`Cron: sent ${musicianEmails} musician reminders, ${adminEmails} admin heads-ups`)

  return NextResponse.json({
    offersProcessed: expiringOffers.length,
    musicianEmails,
    adminEmails,
  })
}
