import { createServiceClient } from '@/lib/supabase/server'

interface LogEmailParams {
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
 * Log a sent email to the email_logs table for audit purposes.
 * This should be called from API routes after successfully sending an email.
 * Failures are logged but never throw — email logging should never break the main flow.
 */
export async function logEmail(params: LogEmailParams): Promise<void> {
  try {
    const supabase = createServiceClient()
    const plainBody = params.body ? htmlToPlainText(params.body) : null
    await supabase.from('email_logs').insert({
      organization_id: params.organizationId,
      recipient_email: params.recipientEmail,
      recipient_name: params.recipientName || null,
      subject: params.subject,
      email_type: params.emailType,
      musician_id: params.musicianId || null,
      project_id: params.projectId || null,
      offer_id: params.offerId || null,
      resend_email_id: params.resendEmailId || null,
      status: 'sent',
      metadata: params.metadata || {},
      body: plainBody,
    })
  } catch (err) {
    console.warn('Failed to log email:', err)
  }
}
