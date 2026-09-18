import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { serverError } from '@/lib/api-helpers'

/**
 * Resend delivery-event webhook (A8, 2026-09-18 hardening).
 *
 * Before this, a dead or bounced musician address just showed "sent" forever
 * in email_logs — Resend knew the mail bounced, but nothing in the app ever
 * heard about it. This route lets Resend tell us, so the roster can flag it
 * (see musicians.email_status, migration 087, and the badge in
 * musicians-client.tsx).
 *
 * ---------------------------------------------------------------------------
 * Signature verification (Svix, which Resend uses to sign webhooks)
 * ---------------------------------------------------------------------------
 * Resend does not use `svix` the npm package — it just uses the same signing
 * SCHEME, documented at https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests.
 * Since `svix` isn't already a dependency of this project, verification is
 * implemented directly against Node's `crypto` rather than pulling in a new
 * package for one HMAC check:
 *
 *   1. The secret from the Resend dashboard looks like `whsec_<base64>` — the
 *      `whsec_` prefix is stripped and the rest base64-decoded to raw key bytes.
 *   2. The signed content is `${svix-id}.${svix-timestamp}.${raw body}`.
 *   3. HMAC-SHA256(secret, signedContent), base64-encoded, is compared against
 *      each `v1,<base64>` entry in the space-delimited `svix-signature` header
 *      (Svix sends one per active signing key, for rotation) using a
 *      constant-time comparison.
 *   4. `svix-timestamp` must be within 5 minutes of now — bounds how long a
 *      captured request stays replayable even with a leaked secret.
 *
 * Fails CLOSED: any missing header, an unset RESEND_WEBHOOK_SECRET, a stale
 * timestamp, or a signature that doesn't match any key returns 401 and the
 * event is never processed. An unrecognized (but validly signed) event type
 * returns 200 — Resend will add event types over time and an unknown one is
 * not a failure, just nothing to do yet.
 */

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60

function timestampWithinTolerance(svixTimestamp: string): boolean {
  const ts = Number(svixTimestamp)
  if (!Number.isFinite(ts)) return false
  const nowSeconds = Date.now() / 1000
  return Math.abs(nowSeconds - ts) <= SIGNATURE_TOLERANCE_SECONDS
}

function constantTimeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

function verifySvixSignature(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  rawBody: string,
  svixSignatureHeader: string,
): boolean {
  const secretKey = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  let secretBytes: Buffer
  try {
    secretBytes = Buffer.from(secretKey, 'base64')
  } catch {
    return false
  }

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`
  const expected = crypto.createHmac('sha256', secretBytes).update(signedContent, 'utf8').digest()

  // Space-delimited, each "v1,<base64signature>" — one per active signing key.
  for (const candidate of svixSignatureHeader.split(' ').filter(Boolean)) {
    const [version, sig] = candidate.split(',')
    if (version !== 'v1' || !sig) continue
    let sigBytes: Buffer
    try {
      sigBytes = Buffer.from(sig, 'base64')
    } catch {
      continue
    }
    if (constantTimeEqual(expected, sigBytes)) return true
  }
  return false
}

interface ResendWebhookEvent {
  type?: string
  data?: {
    email_id?: string
  }
}

/** The musician linked to a logged send, if any — admin-only emails have none. */
async function findMusicianIdForEmail(
  supabase: ReturnType<typeof createAdminClient>,
  resendEmailId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('email_logs')
    .select('musician_id')
    .eq('resend_email_id', resendEmailId)
    .maybeSingle()
  return (data?.musician_id as string | null | undefined) ?? null
}

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret || secret.trim() === '') {
    console.error('RESEND_WEBHOOK_SECRET is not set — refusing to process the Resend webhook.')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rawBody = await request.text()
  const svixId = request.headers.get('svix-id')
  const svixTimestamp = request.headers.get('svix-timestamp')
  const svixSignature = request.headers.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing signature headers' }, { status: 401 })
  }

  if (!timestampWithinTolerance(svixTimestamp)) {
    return NextResponse.json({ error: 'Timestamp outside tolerance' }, { status: 401 })
  }

  if (!verifySvixSignature(secret, svixId, svixTimestamp, rawBody, svixSignature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: ResendWebhookEvent
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const type = event.type
  const resendEmailId = event.data?.email_id ?? null

  // Nothing to key off of, or nothing we handle — ack and stop. Resend must
  // never see a non-2xx for an event shape it's entitled to send.
  if (!resendEmailId || (type !== 'email.bounced' && type !== 'email.complained' && type !== 'email.delivered')) {
    return NextResponse.json({ received: true })
  }

  try {
    const supabase = createAdminClient()
    const musicianId = await findMusicianIdForEmail(supabase, resendEmailId)

    if (type === 'email.bounced' || type === 'email.complained') {
      const status = type === 'email.bounced' ? 'bounced' : 'complained'

      const { error: logError } = await supabase
        .from('email_logs')
        .update({ status })
        .eq('resend_email_id', resendEmailId)
      if (logError) {
        console.warn(`resend webhook: failed to update email_logs status for ${resendEmailId}:`, logError)
      }

      if (musicianId) {
        const { error: musicianError } = await supabase
          .from('musicians')
          .update({ email_status: status, email_status_at: new Date().toISOString() })
          .eq('id', musicianId)
        if (musicianError) {
          console.warn(`resend webhook: failed to update musicians.email_status for ${musicianId}:`, musicianError)
        }
      }
    } else if (type === 'email.delivered' && musicianId) {
      // A later successful delivery clears an earlier bounce/complaint flag —
      // the address is reachable again.
      const { error: musicianError } = await supabase
        .from('musicians')
        .update({ email_status: 'ok', email_status_at: new Date().toISOString() })
        .eq('id', musicianId)
      if (musicianError) {
        console.warn(`resend webhook: failed to reset musicians.email_status for ${musicianId}:`, musicianError)
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    serverError('resend-webhook', error)
    return NextResponse.json({ error: 'Failed to process webhook' }, { status: 500 })
  }
}
