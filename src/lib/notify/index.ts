import { hasRecentFailure, logEmail, type LogEmailParams } from '@/lib/email/log'
import { sendEmail } from '@/lib/email/send'
import { getOrgAdminEmails } from '@/lib/supabase/server'
import { emailProvider } from './providers/email'
import { MUSICIAN_EMAIL_TYPES, copyHtml, copySubject } from './copies'
import type { Channel, NotifyContent } from './types'

export type { Channel, ChannelProvider, EmailPayload, NotifyContent } from './types'

/**
 * notify(event, ctx): the one way the app sends a message to a person.
 *
 * Every transactional and staffing send goes through here: offers, reminders,
 * confirmations, admin copies, crons, billing. What notify owns:
 *
 *   - the channel. Today there is exactly one provider, email, and Podium sends
 *     no texts on any company's behalf (owner decision, 2026-10). The content
 *     is keyed by channel so a later "connect your own texting provider" adds
 *     a provider and a payload, not a second send path.
 *   - the audit trail. A send that goes out is written to email_logs exactly as
 *     its call site wrote it before notify existed (same rows, same fields: the
 *     golden-email tests hold this). A send the provider refuses, which used to
 *     be caught, printed and forgotten, is written as a row with status
 *     'failed', when, and why (migration 097).
 *
 * What it does not own: who is emailed, the subject, the body, the pacing, safe
 * mode. Rendering and the Resend call stay in src/lib/email/send.ts. notify
 * returns the provider's result unchanged and, after recording a failure,
 * rethrows the very same error, so every caller (and offers' delivery_status)
 * behaves exactly as before.
 *
 * Bounced addresses are NOT skipped here: who receives a message is unchanged.
 *
 * Copies (David, 2026-10-04): an email that went out to a musician is also
 * sent, as a marked copy, to that organization's owners and admins
 * (copies.ts). Only after the musician's email really went out (not held back
 * by safe mode), and a copy that fails never affects the original.
 */
export interface NotifyEvent<R> {
  /** What happened, as email_logs.email_type names it: 'contract_offer', 'offer_expired', ... */
  type: string
  /**
   * The audit row(s) for this send. Called with the provider's result after the
   * send went out (or was held back by safe mode), and with null after it
   * failed, in which case notify marks the rows failed. Return null to write
   * nothing (a send with no organization, such as an ops alert, has nowhere to
   * be recorded).
   */
  record: (result: R | null) => LogEmailParams | LogEmailParams[] | null | undefined
  /**
   * false for a send whose successes were never written to email_logs (the
   * admins' copies of an offer, a welcome email): adding those rows would put
   * new lines on every company's Emails page. Its failures are recorded all the
   * same. Default true.
   */
  recordSent?: boolean
}

/** The longest provider message kept on a failed row. */
const MAX_FAILURE_REASON = 500

/**
 * A send that keeps failing is recorded once per this window, not once per
 * attempt: retrying jobs (the after-gig pay summary runs every 15 minutes)
 * would otherwise fill a company's Emails page with identical red rows.
 */
const FAILURE_REPEAT_WINDOW_MS = 24 * 60 * 60 * 1000

export async function notify<R>(event: NotifyEvent<R>, content: NotifyContent<R>): Promise<R> {
  // One channel today. Choosing channels per organization and person (and a
  // provider the company connects itself) is where this grows; until then
  // every event is an email, as it always was.
  const channel: Channel = emailProvider.channel
  let result: R
  try {
    result = await emailProvider.deliver(content.email)
  } catch (error) {
    await recordFailure(event, channel, error)
    throw error
  }
  const delivered = result as { suppressed?: boolean; emailHtml?: string } | null
  const copy = MUSICIAN_EMAIL_TYPES.has(event.type) && !delivered?.suppressed
  if (event.recordSent === false && !copy) return result
  const sent = rows(event.record(result))
  if (event.recordSent !== false) {
    for (const row of sent) await logEmail(row)
  }
  if (copy) {
    for (const row of sent) await sendCopy(event.type, row, row.body || delivered?.emailHtml || null)
  }
  return result
}

/** Send the organization's owners and admins a marked copy of one musician email. */
async function sendCopy(type: string, row: LogEmailParams, html: string | null): Promise<void> {
  try {
    if (!row.organizationId || !html) {
      console.warn(`notify: no copy of the ${type} email to ${row.recipientEmail}: no organization or no body recorded`)
      return
    }
    const admins = await getOrgAdminEmails(row.organizationId)
    if (admins.length === 0) return
    const details = { recipientName: row.recipientName, recipientEmail: row.recipientEmail, subject: row.subject }
    const subject = copySubject(details)
    await notify(
      {
        type: 'admin_copy',
        // Copies stay off the Emails page (it would double every line); a copy
        // that fails is still recorded there.
        recordSent: false,
        record: () => ({
          organizationId: row.organizationId,
          recipientEmail: admins[0],
          subject,
          emailType: 'admin_copy',
          musicianId: row.musicianId,
          projectId: row.projectId,
          offerId: row.offerId,
          metadata: { allRecipients: admins, copyOf: type, originalRecipient: row.recipientEmail },
        }),
      },
      { email: () => sendEmail({ to: admins, subject, html: copyHtml(html, details) }) }
    )
  } catch (error) {
    console.warn(`notify: the copy of the ${type} email to ${row.recipientEmail} could not be sent:`, error)
  }
}

function rows(value: LogEmailParams | LogEmailParams[] | null | undefined): LogEmailParams[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

/** The provider's reason, and the rendered subject when the send got that far (send.ts attaches it). */
export function describeFailure(error: unknown): { reason: string; subject: string | null } {
  const reason = (error instanceof Error ? error.message : String(error ?? 'unknown error')).slice(0, MAX_FAILURE_REASON)
  const subject = (error as { subject?: unknown } | null)?.subject
  return { reason, subject: typeof subject === 'string' && subject ? subject : null }
}

async function recordFailure<R>(event: NotifyEvent<R>, channel: Channel, error: unknown) {
  const { reason, subject } = describeFailure(error)
  const failedAt = new Date().toISOString()
  let planned: LogEmailParams[]
  try {
    planned = rows(event.record(null))
  } catch (recordError) {
    // A record function that cannot describe a failure must not hide the
    // original error from the caller.
    console.warn(`notify: could not describe the failed ${event.type} send for the audit log:`, recordError)
    return
  }
  for (const row of planned) {
    if (await hasRecentFailure(row, FAILURE_REPEAT_WINDOW_MS)) continue
    await logEmail({
      ...row,
      subject: subject || row.subject,
      resendEmailId: null,
      body: null,
      status: 'failed',
      channel,
      failedAt,
      failureReason: reason,
    })
  }
}
