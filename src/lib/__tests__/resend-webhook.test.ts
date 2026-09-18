import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import crypto from 'crypto'

/**
 * A8 (2026-09-18): Resend bounce/complaint webhook.
 *
 * Behavioral tests against the real POST handler with a tiny admin-client
 * fake for email_logs / musicians, matching the style of billing-webhook.test.ts.
 * Signatures are generated with the SAME Svix scheme the route verifies
 * (HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${body}`, base64, against a
 * `whsec_`-prefixed secret) so the happy-path tests exercise real verification,
 * not a mocked bypass.
 */

const SECRET = 'whsec_dGVzdHNlY3JldGtleWZvcnRlc3Rz' // whsec_ + base64("testsecretkeyfortests")

function sign(svixId: string, svixTimestamp: string, body: string, secret = SECRET): string {
  const keyBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const signedContent = `${svixId}.${svixTimestamp}.${body}`
  const sig = crypto.createHmac('sha256', keyBytes).update(signedContent, 'utf8').digest('base64')
  return `v1,${sig}`
}

const fake = vi.hoisted(() => ({
  // resend_email_id -> logged row
  emailLogs: {} as Record<string, { musician_id: string | null }>,
  logStatusUpdates: [] as Array<{ resendEmailId: string; status: string }>,
  musicianUpdates: [] as Array<{ musicianId: string; status: string }>,
  reset() {
    this.emailLogs = {}
    this.logStatusUpdates = []
    this.musicianUpdates = []
  },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      let op: 'select' | 'update' = 'select'
      let patch: any
      const builder: any = {
        select() {
          op = 'select'
          return builder
        },
        update(p: any) {
          op = 'update'
          patch = p
          return builder
        },
        eq(column: string, value: any) {
          if (table === 'email_logs' && op === 'select' && column === 'resend_email_id') {
            const row = fake.emailLogs[value]
            return {
              maybeSingle: () =>
                Promise.resolve({ data: row ? { musician_id: row.musician_id } : null, error: null }),
            }
          }
          if (table === 'email_logs' && op === 'update' && column === 'resend_email_id') {
            fake.logStatusUpdates.push({ resendEmailId: value, status: patch.status })
            return Promise.resolve({ error: null })
          }
          if (table === 'musicians' && op === 'update' && column === 'id') {
            fake.musicianUpdates.push({ musicianId: value, status: patch.email_status })
            return Promise.resolve({ error: null })
          }
          return Promise.resolve({ data: null, error: null })
        },
      }
      return builder
    },
  }),
}))

async function post(body: string, headers: Record<string, string>) {
  const { POST } = await import('@/app/api/webhooks/resend/route')
  return POST(
    new NextRequest('http://localhost/api/webhooks/resend', {
      method: 'POST',
      body,
      headers,
    })
  )
}

function validHeaders(body: string, secret = SECRET) {
  const svixId = 'msg_1'
  const svixTimestamp = String(Math.floor(Date.now() / 1000))
  return {
    'svix-id': svixId,
    'svix-timestamp': svixTimestamp,
    'svix-signature': sign(svixId, svixTimestamp, body, secret),
  }
}

const ORIG_SECRET = process.env.RESEND_WEBHOOK_SECRET

beforeEach(() => {
  fake.reset()
  process.env.RESEND_WEBHOOK_SECRET = SECRET
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  if (ORIG_SECRET === undefined) delete process.env.RESEND_WEBHOOK_SECRET
  else process.env.RESEND_WEBHOOK_SECRET = ORIG_SECRET
})

describe('signature verification — fails closed', () => {
  it('401s when RESEND_WEBHOOK_SECRET is unset', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET
    const body = JSON.stringify({ type: 'email.bounced', data: { email_id: 'em-1' } })
    const res = await post(body, validHeaders(body))
    expect(res.status).toBe(401)
  })

  it('401s when the svix headers are missing', async () => {
    const body = JSON.stringify({ type: 'email.bounced', data: { email_id: 'em-1' } })
    const res = await post(body, {})
    expect(res.status).toBe(401)
  })

  it('401s on a stale timestamp (outside the 5-minute tolerance)', async () => {
    const body = JSON.stringify({ type: 'email.bounced', data: { email_id: 'em-1' } })
    const svixId = 'msg_1'
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 10 * 60)
    const res = await post(body, {
      'svix-id': svixId,
      'svix-timestamp': staleTimestamp,
      'svix-signature': sign(svixId, staleTimestamp, body),
    })
    expect(res.status).toBe(401)
  })

  it('401s on a wrong signature', async () => {
    const body = JSON.stringify({ type: 'email.bounced', data: { email_id: 'em-1' } })
    const svixId = 'msg_1'
    const ts = String(Math.floor(Date.now() / 1000))
    const res = await post(body, {
      'svix-id': svixId,
      'svix-timestamp': ts,
      'svix-signature': 'v1,not-the-right-signature-base64',
    })
    expect(res.status).toBe(401)
  })

  it('401s when the signature was computed with a different secret', async () => {
    const body = JSON.stringify({ type: 'email.bounced', data: { email_id: 'em-1' } })
    const res = await post(body, validHeaders(body, 'whsec_d3JvbmdzZWNyZXQ='))
    expect(res.status).toBe(401)
  })

  it('401s if the body is tampered with after signing', async () => {
    const signedBody = JSON.stringify({ type: 'email.bounced', data: { email_id: 'em-1' } })
    const headers = validHeaders(signedBody)
    const tamperedBody = JSON.stringify({ type: 'email.bounced', data: { email_id: 'em-EVIL' } })
    const res = await post(tamperedBody, headers)
    expect(res.status).toBe(401)
  })

  it('accepts a signature matching the SECOND key in a multi-key svix-signature header', async () => {
    const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'em-multi' } })
    const svixId = 'msg_1'
    const ts = String(Math.floor(Date.now() / 1000))
    const real = sign(svixId, ts, body)
    const res = await post(body, {
      'svix-id': svixId,
      'svix-timestamp': ts,
      'svix-signature': `v1,bogusbase64== ${real}`,
    })
    expect(res.status).toBe(200)
  })
})

describe('email.bounced / email.complained', () => {
  it('marks the email_logs row and the linked musician as bounced', async () => {
    fake.emailLogs['em-1'] = { musician_id: 'mus-1' }
    const body = JSON.stringify({ type: 'email.bounced', data: { email_id: 'em-1' } })

    const res = await post(body, validHeaders(body))

    expect(res.status).toBe(200)
    expect(fake.logStatusUpdates).toEqual([{ resendEmailId: 'em-1', status: 'bounced' }])
    expect(fake.musicianUpdates).toEqual([{ musicianId: 'mus-1', status: 'bounced' }])
  })

  it('marks complained separately from bounced', async () => {
    fake.emailLogs['em-2'] = { musician_id: 'mus-2' }
    const body = JSON.stringify({ type: 'email.complained', data: { email_id: 'em-2' } })

    await post(body, validHeaders(body))

    expect(fake.logStatusUpdates).toEqual([{ resendEmailId: 'em-2', status: 'complained' }])
    expect(fake.musicianUpdates).toEqual([{ musicianId: 'mus-2', status: 'complained' }])
  })

  it('still updates email_logs when the send has no linked musician (an admin-only email)', async () => {
    fake.emailLogs['em-admin'] = { musician_id: null }
    const body = JSON.stringify({ type: 'email.bounced', data: { email_id: 'em-admin' } })

    const res = await post(body, validHeaders(body))

    expect(res.status).toBe(200)
    expect(fake.logStatusUpdates).toEqual([{ resendEmailId: 'em-admin', status: 'bounced' }])
    expect(fake.musicianUpdates).toEqual([])
  })
})

describe('email.delivered', () => {
  it('resets a previously bounced musician back to ok', async () => {
    fake.emailLogs['em-3'] = { musician_id: 'mus-3' }
    const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'em-3' } })

    const res = await post(body, validHeaders(body))

    expect(res.status).toBe(200)
    expect(fake.musicianUpdates).toEqual([{ musicianId: 'mus-3', status: 'ok' }])
    // Delivered never touches email_logs.status — only bounced/complained does.
    expect(fake.logStatusUpdates).toEqual([])
  })
})

describe('unknown event types and missing email ids', () => {
  it('200s on an event type this route does not handle', async () => {
    const body = JSON.stringify({ type: 'email.opened', data: { email_id: 'em-4' } })
    const res = await post(body, validHeaders(body))
    expect(res.status).toBe(200)
    expect(fake.musicianUpdates).toEqual([])
  })

  it('200s when the event carries no email_id', async () => {
    const body = JSON.stringify({ type: 'email.bounced', data: {} })
    const res = await post(body, validHeaders(body))
    expect(res.status).toBe(200)
  })

  it('400s on an unparsable body (even with a valid signature over that garbage)', async () => {
    const body = 'not json'
    const res = await post(body, validHeaders(body))
    expect(res.status).toBe(400)
  })
})
