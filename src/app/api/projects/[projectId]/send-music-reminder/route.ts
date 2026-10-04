import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendMusicReminderEmail, formatPerformanceDateForSubject } from '@/lib/email/send'
import { notify } from '@/lib/notify'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'
import { getOrgPlan } from '@/lib/api-helpers'
import { canUseEmailFeatures } from '@/lib/plan'
import { servicesForMusician, withScope } from '@/lib/staffing/scope'
import { claimReminder } from '@/lib/reminders/claim'

export async function POST(
  request: NextRequest,
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

    const body = await request.json()
    const { sendId } = body

    if (!sendId) {
      return NextResponse.json({ error: 'Send ID is required' }, { status: 400 })
    }

    // Fetch the send record
    const { data: sendRecord, error: sendError } = await serviceClient
      .from('music_sends')
      .select('id, project_id, organization_id, sent_at')
      .eq('id', sendId)
      .eq('project_id', projectId)
      .single()

    if (sendError || !sendRecord) {
      return NextResponse.json({ error: 'Send record not found' }, { status: 404 })
    }

    // Get unconfirmed confirmations
    const { data: unconfirmed, error: confError } = await serviceClient
      .from('music_confirmations')
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

    // Fetch project + org data
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
        services(id, start_time)
      `)
      .eq('id', projectId)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const organization = project.organization as any
    const projectServices = (project?.services as any[] || []).sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

    // Get files with instrument scoping
    const { data: files } = await supabase
      .from('project_files')
      .select('id, file_name, file_size, scope, project_file_instruments(instrument_id)')
      .eq('project_id', projectId)

    // Get each musician's instrument from their position
    const musicianIds = unconfirmed.map((c: any) => c.musician_id)
    const { data: positions } = await withScope((scope) => serviceClient
      .from('project_positions')
      .select(`musician_id, instrument_id${scope}`)
      .eq('project_id', projectId)
      .in('musician_id', musicianIds)
      .eq('status', 'confirmed'))

    // The subject is dated by the first call this person works: a chair
    // limited to some calls (migration 098) is not sent a date it does not
    // play. Every other chair works the whole gig, so it is the gig's first.
    const performanceDateFor = (musicianId: string) => {
      const theirs = servicesForMusician(positions, musicianId, projectServices)
      return theirs[0] ? formatPerformanceDateForSubject(theirs[0].start_time, organization?.timezone || DEFAULT_TIMEZONE) : ''
    }

    const instrumentByMusician: Record<string, string> = {}
    if (positions) {
      for (const pos of positions) {
        if (pos.musician_id) {
          instrumentByMusician[pos.musician_id] = pos.instrument_id
        }
      }
    }

    // Filter files for a specific musician's instrument
    function getFilesForMusician(musicianId: string) {
      const instrumentId = instrumentByMusician[musicianId]
      return (files || []).filter((f: any) => {
        if (f.scope === 'all') return true
        if (f.scope === 'assigned' && instrumentId) {
          return (f.project_file_instruments || []).some(
            (fi: any) => fi.instrument_id === instrumentId
          )
        }
        return false
      })
    }

    const baseUrl = getAppUrl()
    const branding = {
      logoUrl: organization?.email_logo_url,
      brandColor: organization?.email_brand_color,
      footerText: organization?.email_footer_text,
    }

    const adminEmails = await getOrgAdminEmails(organization.id)
    const contactEmail = adminEmails[0]

    let sentCount = 0
    const skippedReasons: string[] = []
    for (let i = 0; i < unconfirmed.length; i++) {
      const conf = unconfirmed[i]
      const musician = conf.musician as any
      if (!musician?.email) {
        skippedReasons.push(`${musician?.first_name || 'Unknown'} ${musician?.last_name || ''}: no email address`)
        continue
      }

      const musicianFiles = getFilesForMusician(conf.musician_id)
      if (musicianFiles.length === 0) {
        skippedReasons.push(`${musician.first_name} ${musician.last_name}: no matching files`)
        continue
      }

      // One reminder per person, even if this request arrives twice (claim.ts).
      if ((await claimReminder(serviceClient, 'music_confirmations', conf.id)) === 'recently_reminded') {
        skippedReasons.push(`${musician.first_name} ${musician.last_name}: already reminded in the last few minutes`)
        continue
      }

      const token = conf.token
      const confirmUrl = `${baseUrl}/confirm-music/${token}`

      try {
        await notify(
          {
            type: 'music_reminder',
            record: (r) => ({
              organizationId: organization.id,
              recipientEmail: musician.email,
              recipientName: `${musician.first_name} ${musician.last_name}`,
              subject: r?.subject || `Reminder: download your music for ${project.name}`,
              emailType: 'music_reminder',
              musicianId: musician.id,
              projectId: projectId,
              resendEmailId: r?.id || null,
              body: r?.emailHtml,
            }),
          },
          {
            email: () =>
              sendMusicReminderEmail({
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
                performanceDate: performanceDateFor(conf.musician_id),
                contactEmail,
                branding,
              }),
          }
        )
        sentCount++
      } catch (emailError) {
        const errMsg = emailError instanceof Error ? emailError.message : 'unknown error'
        skippedReasons.push(`${musician.first_name} ${musician.last_name}: ${errMsg}`)
        console.error(`Failed to send music reminder to ${musician.email}:`, emailError)
      }
    }

    const skipped = unconfirmed.length - sentCount
    return NextResponse.json({
      success: true,
      reminded: sentCount,
      total: unconfirmed.length,
      skipped,
      skippedReasons: skippedReasons.length > 0 ? skippedReasons : undefined,
    })
  } catch (error) {
    console.error('Failed to send music reminders:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send reminders' },
      { status: 500 }
    )
  }
}
