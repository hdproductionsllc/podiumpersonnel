import { NextResponse } from 'next/server'
import { createClient, createServiceClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendMusicUploadedEmail } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { getAppUrl } from '@/lib/utils'
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

    // Parse optional notes
    let notes: string | undefined
    try {
      const body = await request.json()
      notes = body.notes
    } catch {
      // No body
    }

    // Fetch project with organization, files, and positions
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select(`
        id,
        name,
        organization_id,
        organization:organizations(
          id,
          name,
          email_logo_url,
          email_brand_color,
          email_footer_text
        ),
        project_positions(
          id,
          status,
          musician_id,
          instrument_id,
          instrument:instruments(id, name),
          musician:musicians(id, first_name, last_name, email)
        )
      `)
      .eq('id', projectId)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const organization = project.organization as any

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

    // Get confirmed musicians with emails
    const positions = (project.project_positions as any[]) || []
    const filledPositions = positions.filter(
      (p: any) => p.status === 'confirmed' && p.musician_id && p.musician?.email
    )

    if (filledPositions.length === 0) {
      return NextResponse.json(
        { error: 'No confirmed musicians with email addresses' },
        { status: 400 }
      )
    }

    // Create send record
    const { data: sendRecord, error: sendError } = await serviceClient
      .from('music_sends')
      .insert({
        project_id: projectId,
        organization_id: organization.id,
        sent_by: user.id,
        musician_count: filledPositions.length,
        notes: notes || null,
      })
      .select('id')
      .single()

    if (sendError || !sendRecord) {
      console.error('Failed to create music send record:', sendError)
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
      // Delay between sends to avoid Resend rate limit (2 req/sec)
      if (i > 0) await new Promise((r) => setTimeout(r, 600))
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
        const result = await sendMusicUploadedEmail({
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
          notes,
          contactEmail,
          branding,
        })

        sentCount++

        try {
          await logEmail({
            organizationId: organization.id,
            recipientEmail: musician.email,
            recipientName: `${musician.first_name} ${musician.last_name}`,
            subject: `Music Available — ${project.name}`,
            emailType: 'music_available',
            musicianId: musician.id,
            projectId: projectId,
            resendEmailId: result?.id || null,
            metadata: {
              sendId: sendRecord.id,
              fileCount: musicianFiles.length,
            },
          })
        } catch (logError) {
          console.error(`Email sent but failed to log for ${musician.email}:`, logError)
        }
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
