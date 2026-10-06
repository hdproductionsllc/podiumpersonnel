/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServiceClient } from '@/lib/supabase/server'
import { sendGigDetailsEmail } from '@/lib/email/send'
import { notify } from '@/lib/notify'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'
import { formatVenueFields } from '@/lib/venue-helpers'
import { servicesForMusician, withScope } from '@/lib/staffing/scope'
import { confirmedMembers } from '@/lib/projects/send-roster'
import type { SupabaseClient } from '@supabase/supabase-js'

interface SendGigDetailsParams {
  projectId: string
  organizationId: string
  sentBy: string
  additionalNotes?: string
  serviceClient?: SupabaseClient
  /**
   * Follow up an existing send instead of starting a new one: email only the
   * confirmed musicians who are not on it yet (an email filled in afterwards,
   * a sub swapped in), with that send's notes. Nobody already on it hears again.
   */
  followUpSendId?: string
}

interface SendGigDetailsResult {
  sent: number
  failed: number
  failedNames: string[]
  /** On the gig but not emailed: no email address on file. */
  skippedNames: string[]
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

  // Fetch project with all related data, and which services each chair works (scope.ts)
  const { data: project, error: projectError } = await withScope((scope) => serviceClient
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
        venue_details:venues!services_venue_id_fkey(name, address, city, state, zip, google_maps_url, parking_info, directions),
        venue_2,
        venue_id_2,
        venue_2_details:venues!services_venue_id_2_fkey(name, address, city, state, zip, google_maps_url, parking_info, directions)
      ),
      project_positions(
        id,
        chair_number,
        status,
        musician_id${scope},
        instrument:instruments(id, name),
        musician:musicians(id, first_name, last_name, email, phone)
      )
    `)
    .eq('id', projectId)
    .single())

  if (projectError || !project) {
    throw new Error('Project not found')
  }

  // Cross-tenant guard: this helper uses the RLS-bypassing service client, so
  // we must verify the project belongs to the caller's org before emailing its
  // musicians. Without this, an admin could pass another org's projectId and
  // both email that org's musicians and read their roster.
  if (project.organization_id !== organizationId) {
    throw new Error('Project not found')
  }

  const organization = project.organization as any
  const services = (project.services as any[]) || []
  const positions = (project.project_positions as any[]) || []
  const timezone = organization?.timezone || DEFAULT_TIMEZONE

  if (services.length === 0) {
    throw new Error('Add at least one service before sending gig details')
  }

  // Filled positions (musician assigned and offer accepted). Everyone on them
  // is on the roster and in the count; only those with an email can be sent it.
  const filledPositions = positions.filter(
    (p: any) => p.status === 'confirmed' && p.musician_id && p.musician
  )
  const members = confirmedMembers(filledPositions)

  // Format services for the email: each person is sent the ones their chair
  // works (every one, unless the chair is limited to some).
  const sortedServices = services
    .sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  const formattedServices = sortedServices
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
      ...formatVenueFields(service),
    }))
  const formattedServicesFor = (musicianId: string) =>
    servicesForMusician(filledPositions, musicianId, sortedServices).map(
      (service: any) => formattedServices[sortedServices.indexOf(service)]
    )

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
      email: pos.musician.email || null,
      phone: pos.musician.phone || null,
    }))

  // A follow-up only reaches people not already on that send.
  let alreadyOnSend = new Set<string>()
  let notes = additionalNotes
  if (params.followUpSendId) {
    const { data: existing } = await serviceClient
      .from('gig_detail_sends')
      .select('id, notes, gig_detail_confirmations(musician_id)')
      .eq('id', params.followUpSendId)
      .eq('project_id', projectId)
      .eq('organization_id', organizationId)
      .single()
    if (!existing) throw new Error('Send record not found')
    alreadyOnSend = new Set(
      ((existing.gig_detail_confirmations as any[]) || []).map((c: any) => c.musician_id)
    )
    notes = existing.notes || undefined
  }

  const notYetSent = members.filter((m) => !alreadyOnSend.has(m.musicianId))
  const skippedNames = notYetSent.filter((m) => !m.hasEmail).map((m) => m.name)
  const recipientIds = new Set(notYetSent.filter((m) => m.hasEmail).map((m) => m.musicianId))
  // One email per person, even if they hold two chairs.
  const recipients = roster.filter(
    (r: any, i: number) =>
      recipientIds.has(r.musicianId) && roster.findIndex((o: any) => o.musicianId === r.musicianId) === i
  )

  if (recipients.length === 0) {
    throw new Error(
      skippedNames.length > 0
        ? `No email on file for ${skippedNames.join(', ')}. Add one on their profile, then send again.`
        : params.followUpSendId
          ? 'Everyone on this gig already has these gig details'
          : 'No confirmed musicians to send to'
    )
  }

  // "All N confirmed" is measured against musician_count, so it is everyone on
  // the gig, including anyone who could not be emailed yet.
  let sendRecord: { id: string }
  if (params.followUpSendId) {
    const { error: countError } = await serviceClient
      .from('gig_detail_sends')
      .update({ musician_count: members.length })
      .eq('id', params.followUpSendId)
    if (countError) throw new Error('Failed to update send record')
    sendRecord = { id: params.followUpSendId }
  } else {
    const { data: created, error: sendError } = await serviceClient
      .from('gig_detail_sends')
      .insert({
        project_id: projectId,
        organization_id: organizationId,
        sent_by: sentBy,
        musician_count: members.length,
        notes: additionalNotes || null,
      })
      .select('id')
      .single()

    if (sendError || !created) {
      throw new Error('Failed to create send record')
    }
    sendRecord = created
  }

  // Create confirmation tokens for each musician
  const confirmationInserts = recipients.map((member: any) => ({
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
  for (let i = 0; i < recipients.length; i++) {
    const member = recipients[i]
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
      await notify(
        {
          type: 'gig_details',
          record: (r) => ({
            organizationId: organization.id,
            recipientEmail: member.email,
            recipientName: member.name,
            subject: r?.subject || `Gig details: ${project.name}`,
            emailType: 'gig_details',
            musicianId: member.musicianId,
            projectId: projectId,
            resendEmailId: r?.id || null,
            metadata: {
              sendId: sendRecord.id,
              instrument: member.instrument,
            },
            body: r?.emailHtml,
          }),
        },
        {
          email: () =>
            sendGigDetailsEmail({
              to: member.email,
              musicianName: member.name.split(' ')[0],
              organizationName: organization?.name || 'Orchestra',
              organizationId: organization?.id,
              projectName: project.name,
              ensembleType: project.ensemble_type,
              services: formattedServicesFor(member.musicianId),
              roster: emailRoster,
              confirmUrl,
              notes,
              branding,
            }),
        }
      )

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
    skippedNames,
    sendId: sendRecord.id,
    total: recipients.length,
  }
}
