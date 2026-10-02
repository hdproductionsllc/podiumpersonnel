/**
 * The channel seam of the notify layer.
 *
 * 'sms' is named so the audit table (email_logs.channel, migration 097) and a
 * later provider share one vocabulary. There is NO sms provider: Podium does
 * not register or send texts on any company's behalf. A future "connect your
 * own texting account" adds one provider and one payload type here.
 */
export type Channel = 'email' | 'sms'

/**
 * The email payload: render and hand the message to the email provider, the
 * way src/lib/email/send.ts already does (safe mode, pacing, Reply-To and the
 * List-Unsubscribe headers all live there). Resolves with send.ts's result.
 */
export type EmailPayload<R> = () => Promise<R>

/** What each channel would carry for one event. Only email exists. */
export interface NotifyContent<R> {
  email: EmailPayload<R>
}

/** A way to deliver one channel's payload. Throws when the provider refuses it. */
export interface ChannelProvider<P, R> {
  readonly channel: Channel
  deliver(payload: P): Promise<R>
}
