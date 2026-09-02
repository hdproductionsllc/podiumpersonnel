import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendGigDetailsReminderEmail } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'
import { getVenueName, getVenueMapsUrl, getVenueAddress } from '@/lib/venue-helpers'
import { getOrgPlan } from '@/lib/api-helpers'
import { canUseEmailFeatures } from '@/lib/plan'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const supabase = await createClient()
    const serviceClient = createServiceClient()

    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify org membership + plan gate
    const { data: mem } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
    if (!mem) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 })
    }
    const plan = await getOrgPlan(mem.organization_id)
    if (plan && !canUseEmailFeatures(plan)) {
      return NextResponse.json({ error: 'This feature requires a Pro subscription' }, { status: 403 })
    }

    const body = await request.json()
    const { sendId } = body

    if (!sendId) {
      return NextResponse.json({ error: 'Send ID is required' }, { status: 400 })
    }

    // Fetch the send record with unconfirmed musicians
    const { data: sendRecord, error: sendError } = await serviceClient
      .from('gig_detail_sends')
      .select('id, project_id, organization_id, sent_at')
      .eq('id', sendId)
      .eq('project_id', projectId)
      .single()

    if (sendError || !sendRecord) {
      return NextResponse.json({ error: 'Send record not found' }, { status: 404 })
    }

    // Cross-tenant guard: sendRecord is fetched via the RLS-bypassing service
    // client, so confirm it belongs to the caller's org before emailing.
    if (sendRecord.organization_id !== mem.organization_id) {
      return NextResponse.json({ error: 'Send record not found' }, { status: 404 })
    }

    // Get unconfirmed confirmations
    const { data: unconfirmed, error: confError } = await serviceClient
      .from('gig_detail_confirmations')
      .select(`
        id,
        token,
        musician_id,
        musician:musicians(id, first_name, last_name, email)
      `)
      .eq('send_id', sendId)
      .is('confirmed_at', null)

    if (confError || !unconfirmed || unconfirmed.length === 0) {
      return NextResponse.json({ error: 'No unconfirmed musicians to remind' }, { status: 400 })
    }

    // Fetch project data for email content
    const { data: project } = await supabase
      .from('projects')
      .select(`
        id,
        name,
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
          venue_details:venues!services_venue_id_fkey(name, address, city, state, zip, google_maps_url),
          venue_2,
          venue_id_2,
          venue_2_details:venues!services_venue_id_2_fkey(name, address, city, state, zip, google_maps_url)
        )
      `)
      .eq('id', projectId)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const organization = project.organization as any
    const services = (project.services as any[]) || []
    const timezone = organization?.timezone || DEFAULT_TIMEZONE
    const baseUrl = getAppUrl()

    const formattedServices = services
      .sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .map((service: any) => ({
        name: service.name,
        date: new Date(service.start_time).toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          timeZone: timezone,
        }),
        venue: getVenueName(service),
        venueUrl: getVenueMapsUrl(service),
        venueAddress: getVenueAddress(service),
        venue2: service.venue_2_details || service.venue_2 ? getVenueName({ venue: service.venue_2, venue_details: service.venue_2_details }) : null,
        venue2Url: service.venue_2_details || service.venue_2 ? getVenueMapsUrl({ venue: service.venue_2, venue_details: service.venue_2_details }) : null,
        venue2Address: service.venue_2_details ? getVenueAddress({ venue_details: service.venue_2_details }) : null,
      }))

    const originalSentDate = new Date(sendRecord.sent_at).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: timezone,
    })

    const branding = {
      logoUrl: organization?.email_logo_url,
      brandColor: organization?.email_brand_color,
      footerText: organization?.email_footer_text,
    }

    let sentCount = 0
    const failedNames: string[] = []
    for (let i = 0; i < unconfirmed.length; i++) {
      const conf = unconfirmed[i]
      const musician = conf.musician as any
      if (!musician?.email) {
        failedNames.push(`${musician?.first_name || 'Unknown'} ${musician?.last_name || ''}`)
        continue
      }

      const confirmUrl = `${baseUrl}/confirm-details/${conf.token}`

      try {
        const result = await sendGigDetailsReminderEmail({
          to: musician.email,
          musicianName: musician.first_name,
          organizationName: organization?.name || 'Orchestra',
          organizationId: organization?.id,
          projectName: project.name,
          services: formattedServices,
          confirmUrl,
          originalSentDate,
          branding,
        })

        await logEmail({
          organizationId: organization.id,
          recipientEmail: musician.email,
          recipientName: `${musician.first_name} ${musician.last_name}`,
          subject: result?.subject || `Reminder: please confirm ${project.name}`,
          emailType: 'gig_details_reminder',
          musicianId: musician.id,
          projectId: projectId,
          resendEmailId: result?.id || null,
          body: result?.emailHtml,
        })

        sentCount++
      } catch (emailError) {
        failedNames.push(`${musician.first_name} ${musician.last_name}`)
        console.error(`Failed to send reminder to ${musician.email}:`, emailError)
      }
    }

    return NextResponse.json({
      success: true,
      reminded: sentCount,
      total: unconfirmed.length,
      failed: failedNames.length,
      failedNames: failedNames.length > 0 ? failedNames : undefined,
    })
  } catch (error) {
    console.error('Failed to send gig details reminders:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send reminders' },
      { status: 500 }
    )
  }
}
