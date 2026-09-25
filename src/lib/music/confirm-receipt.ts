import { createServiceClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { escapeHtml } from '@/lib/utils'

/**
 * Mark a musician as having received their music, and tell the org's admins.
 *
 * Two things count as "received": clicking the button on the confirm-music page,
 * or downloading any file from it. Whichever happens first wins — admins get one
 * email per musician per music send, never one per file or one per click.
 *
 * The claim is a single conditional UPDATE, so a double-click or several files
 * downloaded at once can all race here and exactly one of them sends the email.
 *
 * Returns whether this call did the marking (false = already received).
 * Throws only if the claim itself fails; the email is best-effort.
 */
export type ReceiptSource = 'button' | 'download'

export async function confirmMusicReceipt(
  supabase: ReturnType<typeof createServiceClient>,
  confirmationId: string,
  source: ReceiptSource
): Promise<boolean> {
  const { data: claimed, error: claimError } = await supabase
    .from('music_confirmations')
    .update({ confirmed_at: new Date().toISOString() })
    .eq('id', confirmationId)
    .is('confirmed_at', null)
    .select('id')

  if (claimError) throw claimError
  if (!claimed || claimed.length === 0) return false

  try {
    await notifyAdmins(supabase, confirmationId, source)
  } catch (err) {
    console.error(`Failed to notify admins of music receipt (confirmation ${confirmationId}):`, err)
  }
  return true
}

async function notifyAdmins(
  supabase: ReturnType<typeof createServiceClient>,
  confirmationId: string,
  source: ReceiptSource
) {
  const { data: confirmation } = await supabase
    .from('music_confirmations')
    .select(`
      musician:musicians(id, first_name, last_name),
      send:music_sends(
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

  const { count: receivedCount } = await supabase
    .from('music_confirmations')
    .select('*', { count: 'exact', head: true })
    .eq('send_id', send.id)
    .not('confirmed_at', 'is', null)

  const totalCount = send.musician_count || 0
  const allReceived = totalCount > 0 && receivedCount === totalCount

  const musicianName = `${musician.first_name} ${musician.last_name}`.trim()
  const action = source === 'download' ? 'downloaded the music' : 'confirmed receipt of music'
  const subject = allReceived
    ? `All musicians have the music — ${project.name}`
    : source === 'download'
      ? `${musicianName} downloaded the music — ${project.name}`
      : `${musicianName} confirmed music receipt — ${project.name}`

  const lead = `<p><strong>${escapeHtml(musicianName)}</strong> ${action} for <strong>${escapeHtml(project.name)}</strong>.</p>`
  const html = allReceived
    ? `${lead}<p style="color: #16a34a; font-weight: bold;">All ${totalCount} musicians now have their music!</p>`
    : `${lead}<p style="color: #6b7280;">${receivedCount ?? 0} of ${totalCount} musicians have their music so far.</p>`

  const result = await sendEmail({ to: adminEmails, subject, html })

  await logEmail({
    organizationId: send.organization_id,
    recipientEmail: adminEmails[0],
    recipientName: undefined,
    subject,
    emailType: 'music_confirmed',
    musicianId: musician.id,
    projectId: project.id,
    resendEmailId: result?.id || null,
    metadata: { allRecipients: adminEmails, allConfirmed: allReceived, source },
    body: result?.emailHtml,
  })
}
