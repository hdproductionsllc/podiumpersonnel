import { NextResponse } from 'next/server'
import { createServiceClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const supabase = createServiceClient()

    // Find the confirmation with full context for admin notification
    const { data: confirmation, error: fetchError } = await supabase
      .from('gig_detail_confirmations')
      .select(`
        id,
        confirmed_at,
        musician_id,
        musician:musicians(id, first_name, last_name),
        send:gig_detail_sends(
          id,
          project_id,
          organization_id,
          musician_count,
          project:projects(id, name)
        )
      `)
      .eq('token', token)
      .single()

    if (fetchError || !confirmation) {
      return NextResponse.json({ error: 'Confirmation not found' }, { status: 404 })
    }

    // Already confirmed — just return success
    if (confirmation.confirmed_at) {
      return NextResponse.json({ success: true, alreadyConfirmed: true })
    }

    // Mark as confirmed
    const { error: updateError } = await supabase
      .from('gig_detail_confirmations')
      .update({ confirmed_at: new Date().toISOString() })
      .eq('id', confirmation.id)

    if (updateError) {
      console.error('Failed to confirm:', updateError)
      return NextResponse.json({ error: 'Failed to confirm' }, { status: 500 })
    }

    // Notify org admins
    const musician = confirmation.musician as any
    const send = confirmation.send as any
    const project = send?.project as any

    if (send?.organization_id && musician && project) {
      try {
        // Check how many are now confirmed
        const { count: confirmedCount } = await supabase
          .from('gig_detail_confirmations')
          .select('*', { count: 'exact', head: true })
          .eq('send_id', send.id)
          .not('confirmed_at', 'is', null)

        const totalCount = send.musician_count || 0
        const allConfirmed = confirmedCount === totalCount

        const musicianName = `${musician.first_name} ${musician.last_name}`
        const subject = allConfirmed
          ? `All musicians confirmed — ${project.name}`
          : `${musicianName} confirmed gig details — ${project.name}`

        const html = allConfirmed
          ? `<p><strong>${musicianName}</strong> has confirmed the gig details for <strong>${project.name}</strong>.</p><p style="color: #16a34a; font-weight: bold;">All ${totalCount} musicians have now confirmed!</p>`
          : `<p><strong>${musicianName}</strong> has confirmed the gig details for <strong>${project.name}</strong>.</p><p style="color: #6b7280;">${confirmedCount} of ${totalCount} musicians confirmed so far.</p>`

        const adminEmails = await getOrgAdminEmails(send.organization_id)

        if (adminEmails.length > 0) {
          const result = await sendEmail({
            to: adminEmails,
            subject,
            html,
          })

          await logEmail({
            organizationId: send.organization_id,
            recipientEmail: adminEmails[0],
            recipientName: undefined,
            subject,
            emailType: 'gig_details_confirmed',
            musicianId: musician.id,
            projectId: project.id,
            resendEmailId: result?.id || null,
            metadata: { allRecipients: adminEmails, allConfirmed },
            body: result?.emailHtml,
          })
        }
      } catch (emailError) {
        // Don't fail the confirmation if email fails
        console.error('Failed to send admin notification:', emailError)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Confirmation error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
