import { createServiceClient } from '@/lib/supabase/server'
import { isMissingColumn } from '@/lib/staffing/rpc'

export interface LogEmailParams {
  organizationId: string
  recipientEmail: string
  recipientName?: string
  subject: string
  emailType: string
  musicianId?: string | null
  projectId?: string | null
  offerId?: string | null
  resendEmailId?: string | null
  metadata?: Record<string, unknown>
  body?: string | null
  /** Defaults to 'sent'. 'suppressed' when safe mode blocked every recipient, 'failed' when the provider refused the send. */
  status?: string
  /**
   * Migration 097. Each is left out of the insert unless given, so the row for
   * a send that went out is written exactly as before 097 (the database fills
   * channel = 'email'). The notify layer sets them on a failed send.
   */
  channel?: 'email' | 'sms'
  failedAt?: string | null
  failureReason?: string | null
}

/** Convert HTML email to readable plain text for storage */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')  // Remove style blocks
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script blocks
    .replace(/<br\s*\/?>/gi, '\n')                     // BR → newline
    .replace(/<\/p>/gi, '\n\n')                        // Close P → double newline
    .replace(/<\/div>/gi, '\n')                        // Close DIV → newline
    .replace(/<\/tr>/gi, '\n')                         // Close TR → newline
    .replace(/<\/li>/gi, '\n')                         // Close LI → newline
    .replace(/<hr[^>]*>/gi, '\n---\n')                 // HR → separator
    .replace(/<a[^>]*href="([^"]*)"[^>]*>[^<]*<\/a>/gi, '$1') // Links → URL
    .replace(/<[^>]+>/g, '')                           // Strip remaining tags
    .replace(/&nbsp;/gi, ' ')                          // Decode entities
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')                        // Collapse excess newlines
    .trim()
}

/**
 * Write one row to the email_logs audit table. The notify layer
 * (src/lib/notify/) calls this for every send it records, the ones that went
 * out and the ones that failed; send sites go through notify().
 * Failures are logged but never throw — email logging should never break the main flow.
 */
export async function logEmail(params: LogEmailParams): Promise<void> {
  try {
    const supabase = createServiceClient()
    const plainBody = params.body ? htmlToPlainText(params.body) : null
    // PostgREST reports failures in the result, not by throwing, so the catch
    // below alone would never see a rejected insert.
    const row = {
      organization_id: params.organizationId,
      recipient_email: params.recipientEmail,
      recipient_name: params.recipientName || null,
      subject: params.subject,
      email_type: params.emailType,
      musician_id: params.musicianId || null,
      project_id: params.projectId || null,
      offer_id: params.offerId || null,
      resend_email_id: params.resendEmailId || null,
      status: params.status || 'sent',
      metadata: params.metadata || {},
      body: plainBody,
    }
    const deliveryColumns = {
      ...(params.channel ? { channel: params.channel } : {}),
      ...(params.failedAt ? { failed_at: params.failedAt } : {}),
      ...(params.failureReason ? { failure_reason: params.failureReason } : {}),
    }
    let { error } = await supabase.from('email_logs').insert({ ...row, ...deliveryColumns })
    if (error && Object.keys(deliveryColumns).length > 0 && isMissingColumn(error)) {
      // 097 not applied yet: keep the record, with the failure in metadata.
      console.warn(
        `email_logs: migration 097 (scripts/sql/097-email-logs-channel.paste.sql) has not been applied; ` +
          `logging this ${params.emailType} row without its delivery columns`
      )
      ;({ error } = await supabase.from('email_logs').insert({
        ...row,
        metadata: {
          ...row.metadata,
          ...(params.failedAt ? { failedAt: params.failedAt } : {}),
          ...(params.failureReason ? { failureReason: params.failureReason } : {}),
        },
      }))
    }
    if (error) {
      console.warn(`Failed to log ${params.emailType} email to ${params.recipientEmail}:`, error)
    }
  } catch (err) {
    console.warn('Failed to log email:', err)
  }
}
