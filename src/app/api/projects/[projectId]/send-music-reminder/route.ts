import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendMusicReminderEmail } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { getAppUrl } from '@/lib/utils'

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

    // Get files for display in reminder
    const { data: files } = await supabase
      .from('project_files')
      .select('id, file_name, file_size')
      .eq('project_id', projectId)

    const baseUrl = getAppUrl()
    const branding = {
      logoUrl: organization?.email_logo_url,
      brandColor: organization?.email_brand_color,
      footerText: organization?.email_footer_text,
    }

    let sentCount = 0
    for (const conf of unconfirmed) {
      const musician = conf.musician as any
      if (!musician?.email) continue

      const portalUrl = `${baseUrl}/musician/music?project=${projectId}`

      try {
        const result = await sendMusicReminderEmail({
          to: musician.email,
          musicianName: musician.first_name,
          organizationName: organization?.name || 'Orchestra',
          projectName: project.name,
          files: (files || []).map((f: any) => ({
            name: f.file_name,
            size: f.file_size,
          })),
          portalUrl,
          branding,
        })

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

        sentCount++
      } catch (emailError) {
        console.error(`Failed to send music reminder to ${musician.email}:`, emailError)
      }
    }

    const skipped = unconfirmed.length - sentCount
    return NextResponse.json({ success: true, reminded: sentCount, total: unconfirmed.length, skipped })
  } catch (error) {
    console.error('Failed to send music reminders:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send reminders' },
      { status: 500 }
    )
  }
}
