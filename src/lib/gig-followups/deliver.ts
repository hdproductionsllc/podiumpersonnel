import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import { getOrgOwnerEmail } from '@/lib/supabase/server'
import { notify } from '@/lib/notify'
import { getAppUrl } from '@/lib/utils'
import { renderFollowup } from './render'
import type { ImageAttachment } from './validation'

/** Permanent compare-and-set claim: a timeout/refresh must never repeat a send.
 * Ambiguous provider outcomes need reconciliation, never an automatic resend.
 */
export async function deliverFollowup(db: SupabaseClient, id: string, organizationId: string) {
  const { data: batch, error } = await db.from('gig_followups').update({ status: 'sending', started_at: new Date().toISOString() })
    .eq('id', id).eq('organization_id', organizationId).eq('status', 'pending').select('*').maybeSingle()
  if (error) throw error
  if (!batch) return // another request owns this batch, or it has already completed
  const { data: recipients, error: recipientsError } = await db.from('gig_followup_recipients').select('*').eq('followup_id', id)
  if (recipientsError || !recipients?.length) throw recipientsError || new Error('No recipients')
  const attachments = batch.attachments as ImageAttachment[]
  const replyTo = await getOrgOwnerEmail(organizationId)
  const subject = `${batch.mode === 'material_update' ? 'Updated gig details' : 'Gig follow-up'}: ${batch.project_name} — ${batch.subject}`
  const type = batch.mode === 'material_update' ? 'gig_details_update' : 'gig_followup'
  for (const recipient of recipients) {
    const { data: claimed, error: claimError } = await db.from('gig_followup_recipients').update({ status: 'sending' })
      .eq('followup_id', id).eq('musician_id', recipient.musician_id).eq('status', 'pending').select('musician_id').maybeSingle()
    if (claimError) throw claimError
    if (!claimed) continue
    const content = renderFollowup({
      projectName: batch.project_name, organizationName: batch.organization_name, message: batch.message,
      confirmationUrl: recipient.confirmation_token ? `${getAppUrl()}/confirm-details/${recipient.confirmation_token}` : undefined,
      filenames: attachments.map(a => a.filename),
    })
    let status = 'uncertain'
    let providerId: string | null = null
    try {
      const result = await notify({
        type, copyAttachments: attachments, copyIdempotencyKey: `gig-followup-copy/${id}/${recipient.musician_id}`,
        record: (r: Awaited<ReturnType<typeof sendEmail>> | null) => ({
          organizationId, projectId: batch.project_id, musicianId: recipient.musician_id,
          recipientEmail: recipient.recipient_email, recipientName: recipient.recipient_name,
          subject, emailType: type, resendEmailId: r?.id || null, body: r?.emailHtml,
          status: r?.suppressed ? 'suppressed' : 'sent',
          metadata: { followupId: id, attachmentNames: attachments.map(a => a.filename) },
        }),
      }, { email: () => sendEmail({
        to: recipient.recipient_email, subject, ...content, attachments,
        fromName: batch.organization_name, replyTo: replyTo || undefined,
        idempotencyKey: `gig-followup/${id}/${recipient.musician_id}`,
      }) })
      status = result.suppressed ? 'suppressed' : 'sent'
      providerId = result.id || null
    } catch {
      // An HTTP timeout may mean accepted by the provider. Keep it explicitly uncertain.
      console.warn('Gig follow-up needs delivery reconciliation', { followupId: id, musicianId: recipient.musician_id })
    }
    const { error: saveError } = await db.from('gig_followup_recipients').update({ status, provider_id: providerId })
      .eq('followup_id', id).eq('musician_id', recipient.musician_id)
    if (saveError) throw saveError
  }
  const { error: doneError } = await db.from('gig_followups').update({ status: 'complete', completed_at: new Date().toISOString() })
    .eq('id', id).eq('organization_id', organizationId)
  if (doneError) throw doneError
}
