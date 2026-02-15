import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendMusicReminderEmail } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { getAppUrl } from '@/lib/utils'
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
          email_logo_url,
          email_brand_color,
          email_footer_text
        )
      `)
      .eq('id', projectId)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const organization = project.organization as any

    // Get files with instrument scoping
    const { data: files } = await supabase
      .from('project_files')
      .select('id, file_name, file_size, scope, project_file_instruments(instrument_id)')
      .eq('project_id', projectId)

    // Get each musician's instrument from their position
    const musicianIds = unconfirmed.map((c: any) => c.musician_id)
    const { data: positions } = await serviceClient
      .from('project_positions')
      .select('musician_id, instrument_id')
      .eq('project_id', projectId)
      .in('musician_id', musicianIds)
      .eq('status', 'confirmed')

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
      // Delay between sends to avoid Resend rate limit (2 req/sec)
      if (i > 0) await new Promise((r) => setTimeout(r, 600))
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

      const token = conf.token
      const confirmUrl = `${baseUrl}/confirm-music/${token}`

      try {
        const result = await sendMusicReminderEmail({
          to: musician.email,
          musicianName: musician.first_name,
          organizationName: organization?.name || 'Orchestra',
          projectName: project.name,
          files: musicianFiles.map((f: any) => ({
            name: f.file_name,
            size: f.file_size,
            downloadUrl: `${baseUrl}/api/music-download/${f.id}?token=${token}`,
          })),
          confirmUrl,
          contactEmail,
          branding,
        })

        sentCount++

        try {
          await logEmail({
            organizationId: organization.id,
            recipientEmail: musician.email,
            recipientName: `${musician.first_name} ${musician.last_name}`,
            subject: `Reminder: Download your music — ${project.name}`,
            emailType: 'music_reminder',
            musicianId: musician.id,
            projectId: projectId,
            resendEmailId: result?.id || null,
          })
        } catch (logError) {
          console.error(`Email sent but failed to log for ${musician.email}:`, logError)
        }
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
