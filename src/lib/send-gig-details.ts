/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServiceClient } from '@/lib/supabase/server'
import { sendGigDetailsEmail } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'
import { getVenueDisplay } from '@/lib/venue-helpers'
import type { SupabaseClient } from '@supabase/supabase-js'

interface SendGigDetailsParams {
  projectId: string
  organizationId: string
  sentBy: string
  additionalNotes?: string
  serviceClient?: SupabaseClient
}

interface SendGigDetailsResult {
  sent: number
  failed: number
  failedNames: string[]
  sendId: string
  total: number
}

/**
 * Core logic for sending gig details to musicians.
 * Used by both the manual send endpoint and the pre-gig reminder approval flow.
 */
export async function sendGigDetailsToMusicians(params: SendGigDetailsParams): Promise<SendGigDetailsResult> {
  const { projectId, organizationId, sentBy, additionalNotes } = params
  const serviceClient = params.serviceClient || createServiceClient()

  // Fetch project with all related data
  const { data: project, error: projectError } = await serviceClient
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
    throw new Error('Project not found')
  }

  const organization = project.organization as any
  const services = (project.services as any[]) || []
  const positions = (project.project_positions as any[]) || []
  const timezone = organization?.timezone || DEFAULT_TIMEZONE

  if (services.length === 0) {
    throw new Error('Add at least one service before sending gig details')
  }

  // Only include filled positions (musician assigned and offer accepted)
  const filledPositions = positions.filter(
    (p: any) => p.status === 'confirmed' && p.musician_id && p.musician?.email
  )

  if (filledPositions.length === 0) {
    throw new Error('No confirmed musicians with email addresses to send to')
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

  // Create the send record
  const { data: sendRecord, error: sendError } = await serviceClient
    .from('gig_detail_sends')
    .insert({
      project_id: projectId,
      organization_id: organizationId,
      sent_by: sentBy,
      musician_count: roster.length,
    })
    .select('id')
    .single()

  if (sendError || !sendRecord) {
    throw new Error('Failed to create send record')
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
    throw new Error('Failed to create confirmation records')
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
        musicianName: member.name.split(' ')[0],
        organizationName: organization?.name || 'Orchestra',
        projectName: project.name,
        ensembleType: project.ensemble_type,
        services: formattedServices,
        roster: emailRoster,
        confirmUrl,
        notes: additionalNotes,
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
        body: result?.emailHtml,
      })

      sentCount++
    } catch (emailError) {
      failedNames.push(member.name)
      console.error(`Failed to send gig details to ${member.email}:`, emailError)
    }
  }

  return {
    sent: sentCount,
    failed: failedNames.length,
    failedNames,
    sendId: sendRecord.id,
    total: roster.length,
  }
}
