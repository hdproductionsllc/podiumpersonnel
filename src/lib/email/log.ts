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
}

/**
 * Log a sent email to the email_logs table for audit purposes.
 * This should be called from API routes after successfully sending an email.
 * Failures are logged but never throw — email logging should never break the main flow.
 */
export async function logEmail(params: LogEmailParams): Promise<void> {
  try {
    const supabase = createServiceClient()
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
    })
  } catch (err) {
    console.warn('Failed to log email:', err)
  }
}
