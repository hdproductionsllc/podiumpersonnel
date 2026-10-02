import { createServiceClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { escapeHtml } from '@/lib/utils'

/**
 * Mark a musician as having read the gig details, and tell the org's admins.
 *
 * The claim is a single conditional UPDATE, so a double-click or a resubmitted
 * form can race here and exactly one of them sends the admin email.
 *
 * Returns whether this call did the marking (false = already confirmed).
 * Throws only if the claim itself fails; the email is best-effort.
 */
export async function confirmGigDetails(
  supabase: ReturnType<typeof createServiceClient>,
  confirmationId: string
): Promise<boolean> {
  const { data: claimed, error: claimError } = await supabase
    .from('gig_detail_confirmations')
    .update({ confirmed_at: new Date().toISOString() })
    .eq('id', confirmationId)
    .is('confirmed_at', null)
    .select('id')

  if (claimError) throw claimError
  if (!claimed || claimed.length === 0) return false

  try {
    await notifyAdmins(supabase, confirmationId)
  } catch (err) {
    console.error(`Failed to notify admins of gig details confirmation ${confirmationId}:`, err)
  }
  return true
}

async function notifyAdmins(
  supabase: ReturnType<typeof createServiceClient>,
  confirmationId: string
) {
  const { data: confirmation } = await supabase
    .from('gig_detail_confirmations')
    .select(`
      musician:musicians(id, first_name, last_name),
      send:gig_detail_sends(
        id,
        organization_id,
        musician_count,
        project:projects(id, name)
      )
    `)
    .eq('id', confirmationId)
    .single()

  // Many-to-one embeds arrive as a single object; the generated types say array.
  const musician = confirmation?.musician as unknown as { id: string; first_name: string; last_name: string } | null
  const send = confirmation?.send as unknown as {
    id: string
    organization_id: string
    musician_count: number | null
    project: { id: string; name: string } | null
  } | null
  const project = send?.project
  if (!musician || !send?.organization_id || !project) return

  const adminEmails = await getOrgAdminEmails(send.organization_id)
  if (adminEmails.length === 0) return

  const { count: confirmedCount } = await supabase
    .from('gig_detail_confirmations')
    .select('*', { count: 'exact', head: true })
    .eq('send_id', send.id)
    .not('confirmed_at', 'is', null)

  const totalCount = send.musician_count || 0
  const allConfirmed = totalCount > 0 && confirmedCount === totalCount

  const musicianName = `${musician.first_name} ${musician.last_name}`.trim()
  const subject = allConfirmed
    ? `All musicians confirmed — ${project.name}`
    : `${musicianName} confirmed gig details — ${project.name}`

  const lead = `<p><strong>${escapeHtml(musicianName)}</strong> has confirmed the gig details for <strong>${escapeHtml(project.name)}</strong>.</p>`
  const html = allConfirmed
    ? `${lead}<p style="color: #16a34a; font-weight: bold;">All ${totalCount} musicians have now confirmed!</p>`
    : `${lead}<p style="color: #6b7280;">${confirmedCount ?? 0} of ${totalCount} musicians confirmed so far.</p>`

  const result = await sendEmail({ to: adminEmails, subject, html })

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
