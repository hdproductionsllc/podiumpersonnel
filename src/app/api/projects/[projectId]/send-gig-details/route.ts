import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendGigDetailsEmail } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'
import { getVenueName, getVenueDisplay } from '@/lib/venue-helpers'
import { getOrgPlan } from '@/lib/api-helpers'
import { canUseEmailFeatures } from '@/lib/plan'

export async function POST(
  request: Request,
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
      return NextResponse.json({ error: 'Sending gig details requires a Pro subscription' }, { status: 403 })
    }

    // Parse optional notes from body
    let notes: string | undefined
    try {
      const body = await request.json()
      notes = body.notes
    } catch {
      // No body or invalid JSON — that's fine
    }

    // Fetch project with all related data
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select(`
        id,
        name,
        ensemble_type,
        start_date,
        organization_id,
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
          service_type,
          call_time,
          start_time,
          end_time,
          venue,
          venue_id,
          venue_details:venues(name, address, city, state, zip, parking_info, directions)
        ),
        project_positions(
          id,
          chair_number,
          status,
          musician_id,
          instrument:instruments(id, name),
          musician:musicians(id, first_name, last_name, email, phone)
        )
      `)
      .eq('id', projectId)
      .single()

    if (projectError || !project) {
      console.error('Failed to fetch project:', projectError)
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const organization = project.organization as any
    const services = (project.services as any[]) || []
    const positions = (project.project_positions as any[]) || []
    const timezone = organization?.timezone || DEFAULT_TIMEZONE

    if (services.length === 0) {
      return NextResponse.json(
        { error: 'Add at least one service before sending gig details' },
        { status: 400 }
      )
    }

    // Only include filled positions (musician assigned and offer accepted)
    const filledPositions = positions.filter(
      (p: any) => p.status === 'confirmed' && p.musician_id && p.musician?.email
    )

    if (filledPositions.length === 0) {
      return NextResponse.json(
        { error: 'No confirmed musicians with email addresses to send to' },
        { status: 400 }
      )
    }

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
        venue: getVenueDisplay(service),
        parkingInfo: service.venue_details?.parking_info || null,
        directions: service.venue_details?.directions || null,
      }))

    // Build roster from filled positions
    const roster = filledPositions
      .sort((a: any, b: any) => {
        const instrA = a.instrument?.name || ''
        const instrB = b.instrument?.name || ''
        if (instrA !== instrB) return instrA.localeCompare(instrB)
        return (a.chair_number || 0) - (b.chair_number || 0)
      })
      .map((pos: any) => ({
        musicianId: pos.musician.id,
        name: `${pos.musician.first_name} ${pos.musician.last_name}`,
        instrument: pos.instrument?.name || 'Instrument',
        email: pos.musician.email,
        phone: pos.musician.phone || null,
      }))

    // Create the send record using service client (bypasses RLS)
    const { data: sendRecord, error: sendError } = await serviceClient
      .from('gig_detail_sends')
      .insert({
        project_id: projectId,
        organization_id: organization.id,
        sent_by: user.id,
        musician_count: roster.length,
      })
      .select('id')
      .single()

    if (sendError || !sendRecord) {
      console.error('Failed to create send record:', sendError)
      return NextResponse.json({ error: 'Failed to create send record' }, { status: 500 })
    }

    // Create confirmation tokens for each musician
    const confirmationInserts = roster.map((member: any) => ({
      send_id: sendRecord.id,
      musician_id: member.musicianId,
    }))

    const { data: confirmations, error: confirmError } = await serviceClient
      .from('gig_detail_confirmations')
      .insert(confirmationInserts)
      .select('id, musician_id, token')

    if (confirmError || !confirmations) {
      console.error('Failed to create confirmations:', confirmError)
      return NextResponse.json({ error: 'Failed to create confirmation records' }, { status: 500 })
    }

    // Build a map of musician_id -> token
    const tokenMap = new Map<string, string>()
    for (const conf of confirmations) {
      tokenMap.set(conf.musician_id, conf.token)
    }

    const baseUrl = getAppUrl()
    const branding = {
      logoUrl: organization?.email_logo_url,
      brandColor: organization?.email_brand_color,
      footerText: organization?.email_footer_text,
    }

    // Send email to each musician
    let sentCount = 0
    const failedNames: string[] = []
    for (let i = 0; i < roster.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 600))
      const member = roster[i]
      const token = tokenMap.get(member.musicianId)
      if (!token) continue

      const confirmUrl = `${baseUrl}/confirm-details/${token}`

      // Build roster with isRecipient flag for this specific musician
      const emailRoster = roster.map((r: any) => ({
        name: r.name,
        instrument: r.instrument,
        email: r.email,
        phone: r.phone,
        isRecipient: r.musicianId === member.musicianId,
      }))

      try {
        const result = await sendGigDetailsEmail({
          to: member.email,
          musicianName: member.name.split(' ')[0], // First name only
          organizationName: organization?.name || 'Orchestra',
          projectName: project.name,
          ensembleType: project.ensemble_type,
          services: formattedServices,
          roster: emailRoster,
          confirmUrl,
          notes,
          branding,
        })

        await logEmail({
          organizationId: organization.id,
          recipientEmail: member.email,
          recipientName: member.name,
          subject: `Gig Details — ${project.name}`,
          emailType: 'gig_details',
          musicianId: member.musicianId,
          projectId: projectId,
          resendEmailId: result?.id || null,
          metadata: {
            sendId: sendRecord.id,
            instrument: member.instrument,
          },
        })

        sentCount++
      } catch (emailError) {
        failedNames.push(member.name)
        console.error(`Failed to send gig details to ${member.email}:`, emailError)
      }
    }

    return NextResponse.json({
      success: true,
      sent: sentCount,
      failed: failedNames.length,
      failedNames: failedNames.length > 0 ? failedNames : undefined,
      total: roster.length,
      sendId: sendRecord.id,
    })
  } catch (error) {
    console.error('Failed to send gig details:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send gig details' },
      { status: 500 }
    )
  }
}
