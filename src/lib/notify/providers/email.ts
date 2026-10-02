import type { EmailPayload } from '../types'

/**
 * The email provider. Delivery itself (React Email render, safe mode, Resend
 * pacing, the Resend call) stays in src/lib/email/send.ts; the payload is the
 * call into it, so this provider only runs it.
 */
export const emailProvider = {
  channel: 'email' as const,
  deliver<R>(payload: EmailPayload<R>): Promise<R> {
    return payload()
  },
}
