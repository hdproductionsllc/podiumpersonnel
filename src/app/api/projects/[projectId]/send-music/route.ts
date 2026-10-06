import { NextResponse } from 'next/server'
import { createClient, createServiceClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendMusicUploadedEmail, formatPerformanceDateForSubject } from '@/lib/email/send'
import { notify } from '@/lib/notify'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'
import { getOrgPlan } from '@/lib/api-helpers'
import { canUseEmailFeatures } from '@/lib/plan'
import { servicesForMusician, withScope } from '@/lib/staffing/scope'
import { confirmedMembers } from '@/lib/projects/send-roster'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const supabase = await createClient()
    const serviceClient = createServiceClient()

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

    // Parse optional notes. followUp: send the latest send to the people on
    // the gig who are not on it yet, with its notes, instead of starting over.
    let notes: string | undefined
    let followUp = false
    try {
      const body = await request.json()
      notes = body.notes
      followUp = body.followUp === true
    } catch {
      // No body
    }

    // Fetch project with organization, files, and positions
    const { data: project, error: projectError } = await withScope((scope) => supabase
      .from('projects')
      .select(`
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
        services(id, start_time),
        project_positions(
          id,
          status,
          musician_id,
          instrument_id${scope},
          instrument:instruments(id, name),
          musician:musicians(id, first_name, last_name, email)
        )
      `)
      .eq('id', projectId)
      .single())

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const organization = project.organization as any
    const projectServices = (project?.services as any[] || []).sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    // The subject is dated by the first call this person works: a chair
    // limited to some calls (migration 098) is not sent a date it does not
    // play. Every other chair works the whole gig, so it is the gig's first.
    const performanceDateFor = (musicianId: string) => {
      const theirs = servicesForMusician(project.project_positions, musicianId, projectServices)
      return theirs[0] ? formatPerformanceDateForSubject(theirs[0].start_time, organization?.timezone || DEFAULT_TIMEZONE) : ''
    }

    // Get all files for this project
    const { data: files, error: filesError } = await supabase
      .from('project_files')
      .select(`
        id,
        file_name,
        file_size,
        scope,
        project_file_instruments(instrument_id)
      `)
      .eq('project_id', projectId)

    if (filesError || !files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files uploaded for this project' },
        { status: 400 }
      )
    }

    // Everyone on a confirmed chair counts toward the send; only those with an
    // email can be sent it, and the rest are named back to the admin.
    const positions = (project.project_positions as any[]) || []
    const members = confirmedMembers(positions)

    // A follow-up only reaches people not already on the latest send.
    let followUpSend: { id: string } | null = null
    let alreadyOnSend = new Set<string>()
    if (followUp) {
      const { data: latestSend } = await serviceClient
        .from('music_sends')
        .select('id, notes, music_confirmations(musician_id)')
        .eq('project_id', projectId)
        .eq('organization_id', organization.id)
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!latestSend) {
        return NextResponse.json({ error: 'Music has not been sent yet' }, { status: 400 })
      }
      followUpSend = { id: latestSend.id }
      alreadyOnSend = new Set((latestSend.music_confirmations || []).map((c) => c.musician_id))
      notes = latestSend.notes || undefined
    }

    const notYetSent = members.filter((m) => !alreadyOnSend.has(m.musicianId))
    const skippedNames = notYetSent.filter((m) => !m.hasEmail).map((m) => m.name)
    const recipientIds = new Set(notYetSent.filter((m) => m.hasEmail).map((m) => m.musicianId))
    // One email per person, even if they hold two chairs.
    const filledPositions = positions.filter(
      (p, i) =>
        p.status === 'confirmed' && recipientIds.has(p.musician_id) &&
        positions.findIndex((o) => o.status === 'confirmed' && o.musician_id === p.musician_id) === i
    )

    if (filledPositions.length === 0) {
      return NextResponse.json(
        {
          error: skippedNames.length > 0
            ? `No email on file for ${skippedNames.join(', ')}. Add one on their profile, then send again.`
            : followUp
              ? 'Everyone on this gig has already been sent the music'
              : 'No confirmed musicians to send to',
        },
        { status: 400 }
      )
    }

    // "All confirmed" is measured against musician_count: everyone on the gig.
    let sendRecord: { id: string } | null = followUpSend
    if (followUpSend) {
      const { error: countError } = await serviceClient
        .from('music_sends')
        .update({ musician_count: members.length })
        .eq('id', followUpSend.id)
      if (countError) {
        console.error('Failed to update music send record:', countError)
        return NextResponse.json({ error: 'Failed to update send record' }, { status: 500 })
      }
    } else {
      const { data: created, error: sendError } = await serviceClient
        .from('music_sends')
        .insert({
          project_id: projectId,
          organization_id: organization.id,
          sent_by: user.id,
          musician_count: members.length,
          notes: notes || null,
        })
        .select('id')
        .single()

      if (sendError || !created) {
        console.error('Failed to create music send record:', sendError)
        return NextResponse.json({ error: 'Failed to create send record' }, { status: 500 })
      }
      sendRecord = created
    }
    if (!sendRecord) {
      return NextResponse.json({ error: 'Failed to create send record' }, { status: 500 })
    }

    // Create confirmation records for each musician
    const confirmationInserts = filledPositions.map((pos: any) => ({
      send_id: sendRecord.id,
      musician_id: pos.musician_id,
    }))

    const { data: confirmations, error: confError } = await serviceClient
      .from('music_confirmations')
      .insert(confirmationInserts)
      .select('id, musician_id, token')

    if (confError || !confirmations) {
      console.error('Failed to create music confirmations:', confError)
      return NextResponse.json({ error: 'Failed to create confirmation records' }, { status: 500 })
    }

    const baseUrl = getAppUrl()
    const branding = {
      logoUrl: organization?.email_logo_url,
      brandColor: organization?.email_brand_color,
      footerText: organization?.email_footer_text,
    }

    // Get admin contact email for the "Questions?" line
    const adminEmails = await getOrgAdminEmails(organization.id)
    const contactEmail = adminEmails[0]

    // Build a map of musician_id → confirmation token
    const tokenByMusician: Record<string, string> = {}
    for (const conf of confirmations) {
      tokenByMusician[conf.musician_id] = conf.token
    }

    // Send email to each musician with their specific files + direct download links
    let sentCount = 0
    const failedNames: string[] = []
    for (let i = 0; i < filledPositions.length; i++) {
      const pos = filledPositions[i]
      const musician = pos.musician as any
      const instrumentId = pos.instrument_id
      const token = tokenByMusician[pos.musician_id]

      // Determine which files this musician gets
      const musicianFiles = files.filter((f: any) => {
        if (f.scope === 'all') return true
        if (f.scope === 'assigned') {
          const assignedInstrumentIds = (f.project_file_instruments || []).map(
            (fi: any) => fi.instrument_id
          )
          return assignedInstrumentIds.includes(instrumentId)
        }
        return false
      })

      if (musicianFiles.length === 0) continue

      const confirmUrl = `${baseUrl}/confirm-music/${token}`

      try {
        await notify(
          {
            type: 'music_available',
            record: (r) => ({
              organizationId: organization.id,
              recipientEmail: musician.email,
              recipientName: `${musician.first_name} ${musician.last_name}`,
              subject: r?.subject || `Music available: ${project.name}`,
              emailType: 'music_available',
              musicianId: musician.id,
              projectId: projectId,
              resendEmailId: r?.id || null,
              metadata: {
                sendId: sendRecord.id,
                fileCount: musicianFiles.length,
              },
              body: r?.emailHtml,
            }),
          },
          {
            email: () =>
              sendMusicUploadedEmail({
                to: musician.email,
                musicianName: musician.first_name,
                organizationName: organization?.name || 'Orchestra',
                organizationId: organization?.id,
                projectName: project.name,
                files: musicianFiles.map((f: any) => ({
                  name: f.file_name,
                  size: f.file_size,
                  downloadUrl: `${baseUrl}/api/music-download/${f.id}?token=${token}`,
                })),
                confirmUrl,
                notes,
                performanceDate: performanceDateFor(pos.musician_id),
                contactEmail,
                branding,
              }),
          }
        )
        sentCount++
      } catch (emailError) {
        failedNames.push(`${musician.first_name} ${musician.last_name}`)
        console.error(`Failed to send music email to ${musician.email}:`, emailError)
      }
    }

    return NextResponse.json({
      success: true,
      sent: sentCount,
      failed: failedNames.length,
      failedNames: failedNames.length > 0 ? failedNames : undefined,
      skippedNames: skippedNames.length > 0 ? skippedNames : undefined,
      total: filledPositions.length,
      sendId: sendRecord.id,
    })
  } catch (error) {
    console.error('Failed to send music notifications:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send music notifications' },
      { status: 500 }
    )
  }
}
