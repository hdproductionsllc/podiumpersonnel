import { NextRequest, NextResponse } from 'next/server'
import { createClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendPositionUnassignedEmail, sendEmail, formatPerformanceDateForSubject } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { PODIUM_FOOTER_URL } from '@/lib/email/templates/podium-footer'
import { serverError } from '@/lib/api-helpers'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ positionId: string }> }
) {
  try {
    const { positionId } = await params
    const supabase = await createClient()

    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch the position with all related data
    const { data: position, error: positionError } = await supabase
      .from('project_positions')
      .select(`
        id,
        chair_number,
        musician_id,
        status,
        instrument:instruments(id, name),
        musician:musicians(id, first_name, last_name, email),
        project:projects(
          id,
          name,
          organization_id,
          organization:organizations(id, name, timezone),
          services(start_time)
        )
      `)
      .eq('id', positionId)
      .single()

    if (positionError || !position) {
      return NextResponse.json({ error: 'Position not found' }, { status: 404 })
    }

    const positionData = position as any
    const musician = positionData.musician
    const project = positionData.project
    const organization = project?.organization
    const instrument = positionData.instrument
    const projectServices = (project?.services as any[] || []).sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    const performanceDate = projectServices[0] ? formatPerformanceDateForSubject(projectServices[0].start_time, organization?.timezone) : ''

    // Verify user has permission (is admin/owner of this organization)
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', project?.organization_id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    // Check if position has a musician assigned
    if (!positionData.musician_id) {
      return NextResponse.json({ error: 'Position has no musician assigned' }, { status: 400 })
    }

    // Count total chairs for this instrument
    let totalChairs = 1
    if (project?.id && instrument?.id) {
      const { count } = await supabase
        .from('project_positions')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .eq('instrument_id', instrument.id)
      totalChairs = count || 1
    }

    // Retire this chair's offers rather than deleting them. An accepted offer is
    // the only record that the musician ever said yes, and a pay dispute turns on
    // exactly that; every other transition in the app preserves history.
    //
    // Two terminal statuses, matching what actually happened:
    //  - 'accepted' → 'released'  (migration 063: no longer counted as confirmed
    //                              for this chair — same word the substitution
    //                              flow uses when a sub takes the seat).
    //                 responded_at is left alone so the acceptance keeps its
    //                 timestamp.
    //  - 'pending'/'viewed' → 'rescinded' (the admin withdrew an unanswered offer,
    //                 same as the rescind route).
    // Neither status reads as active anywhere — next-candidate, the expire cron,
    // the offers table and the send-offer dialog all count only pending/viewed/
    // accepted — so the chair reads vacant afterwards. Both updates are
    // idempotent, so a retry after a later failure is a no-op.
    const { error: releaseOffersError } = await supabase
      .from('contract_offers')
      .update({ status: 'released' })
      .eq('project_position_id', positionId)
      .eq('status', 'accepted')

    if (releaseOffersError) {
      return serverError(`Failed to release accepted offers for position ${positionId}`, releaseOffersError)
    }

    const { error: rescindOffersError } = await supabase
      .from('contract_offers')
      .update({ status: 'rescinded', responded_at: new Date().toISOString() })
      .eq('project_position_id', positionId)
      .in('status', ['pending', 'viewed'])

    if (rescindOffersError) {
      return serverError(`Failed to rescind outstanding offers for position ${positionId}`, rescindOffersError)
    }

    // Reset the position to vacant
    const { error: vacateError } = await supabase
      .from('project_positions')
      .update({ musician_id: null, status: 'vacant' })
      .eq('id', positionId)

    if (vacateError) {
      // Nothing has been emailed yet; the admin can retry and the two status
      // updates above are no-ops the second time.
      return serverError(`Failed to vacate position ${positionId}`, vacateError)
    }

    // Send email notifications
    const emailPromises: Promise<any>[] = []

    const musicianSubject = `Position Update: ${project?.name}${performanceDate ? ` (${performanceDate})` : ''}`
    const adminSubject = `Position Unassigned: ${musician?.first_name} ${musician?.last_name} - ${project?.name}${performanceDate ? ` (${performanceDate})` : ''}`

    // Notify the musician if they have an email
    if (musician?.email) {
      emailPromises.push(
        sendPositionUnassignedEmail({
          to: musician.email,
          musicianName: `${musician.first_name} ${musician.last_name}`,
          organizationName: organization?.name || 'Orchestra',
          organizationId: organization?.id,
          projectName: project?.name || 'Project',
          instrument: instrument?.name || 'Instrument',
          chairNumber: positionData.chair_number || 1,
          totalChairs,
          performanceDate,
        }).then((result) => {
          logEmail({
            organizationId: project?.organization_id,
            recipientEmail: musician.email,
            recipientName: `${musician.first_name} ${musician.last_name}`,
            subject: result?.subject || musicianSubject,
            emailType: 'position_unassigned',
            musicianId: musician.id,
            projectId: project?.id,
          })
        }).catch((err) => console.warn('Failed to send musician notification:', err))
      )
    }

    // Notify organization admins
    if (project?.organization_id) {
      const adminEmails = await getOrgAdminEmails(project.organization_id)
      if (adminEmails.length > 0) {
        const adminEmailHtml = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a1a1a;">Position Unassigned</h2>
            <p>A musician has been unassigned from a position:</p>
            <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p><strong>Project:</strong> ${project?.name}</p>
              <p><strong>Position:</strong> ${instrument?.name}, Chair ${positionData.chair_number}</p>
              <p><strong>Musician:</strong> ${musician?.first_name} ${musician?.last_name}</p>
              <p><strong>Unassigned by:</strong> ${user.email}</p>
            </div>
            <p style="color: #666; font-size: 12px;">This notification was sent via <a href="${PODIUM_FOOTER_URL}" style="color:#666;text-decoration:underline;">Podium</a>.</p>
          </div>
        `
        emailPromises.push(
          sendEmail({
            to: adminEmails,
            subject: adminSubject,
            html: adminEmailHtml,
          }).then(() => {
            for (const email of adminEmails) {
              logEmail({
                organizationId: project.organization_id,
                recipientEmail: email,
                subject: adminSubject,
                emailType: 'position_unassigned_admin',
                musicianId: musician?.id,
                projectId: project?.id,
                body: adminEmailHtml,
              })
            }
          }).catch((err) => console.warn('Failed to send admin notification:', err))
        )
      }
    }

    // Wait for emails but don't fail if they fail
    await Promise.allSettled(emailPromises)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to unassign position:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to unassign position' },
      { status: 500 }
    )
  }
}
