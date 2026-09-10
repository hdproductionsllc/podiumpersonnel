import { Resend } from 'resend'

const apiKey = process.env.RESEND_API_KEY
if (!apiKey) {
  console.warn('⚠️ RESEND_API_KEY is not set - emails will not be sent')
}
export const resend = new Resend(apiKey || '')

export const EMAIL_FROM_ADDRESS =
  process.env.EMAIL_FROM_ADDRESS || 'hello@podiumpersonnel.com'

export const EMAIL_DEFAULT_FROM_NAME =
  process.env.EMAIL_FROM_NAME || 'Podium'

export const EMAIL_REPLY_TO =
  process.env.EMAIL_REPLY_TO || EMAIL_FROM_ADDRESS

export const EMAIL_FROM = `${EMAIL_DEFAULT_FROM_NAME} <${EMAIL_FROM_ADDRESS}>`

// ---------------------------------------------------------------------------
// Email safe mode — the single guard that prevents real musicians from being
// emailed during testing. When safe mode is ON, only addresses on the
// allowlist receive mail; every other recipient is suppressed and logged.
//
// FAIL-SAFE: safe mode defaults ON when EMAIL_SAFE_MODE is unset, so a missing
// env var can never accidentally blast real recipients. Turn it OFF for
// production by explicitly setting EMAIL_SAFE_MODE=false.
// ---------------------------------------------------------------------------
function parseBoolDefaultTrue(value: string | undefined): boolean {
  if (value == null || value.trim() === '') return true
  return !['false', '0', 'off', 'no'].includes(value.trim().toLowerCase())
}

const EMAIL_SAFE_MODE = parseBoolDefaultTrue(process.env.EMAIL_SAFE_MODE)

const EMAIL_ALLOWLIST = (process.env.EMAIL_ALLOWLIST || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

export function isEmailSafeMode(): boolean {
  return EMAIL_SAFE_MODE
}

/**
 * Splits intended recipients into those allowed to receive mail and those that
 * must be suppressed. When safe mode is OFF, everyone passes through unchanged.
 * When ON, only allowlisted addresses are returned in `allowed`.
 */
export function filterRecipients(to: string | string[]): {
  allowed: string[]
  suppressed: string[]
} {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean)
  if (!EMAIL_SAFE_MODE) return { allowed: recipients, suppressed: [] }

  const allowed: string[] = []
  const suppressed: string[] = []
  for (const r of recipients) {
    if (EMAIL_ALLOWLIST.includes(r.trim().toLowerCase())) allowed.push(r)
    else suppressed.push(r)
  }
  return { allowed, suppressed }
}

function sanitizeDisplayName(name: string): string {
  // RFC 5322 reserved chars + control chars stripped, collapsed whitespace
  return name.replace(/[<>"\r\n]/g, '').replace(/\s+/g, ' ').trim()
}

export function buildFromAddress(displayName?: string | null): string {
  const safe = displayName ? sanitizeDisplayName(displayName) : ''
  const name = safe || EMAIL_DEFAULT_FROM_NAME
  return `${name} <${EMAIL_FROM_ADDRESS}>`
}

// ---------------------------------------------------------------------------
// Resend rate limit — the provider allows 2 requests per second. Every send
// in the app passes through send.ts, and both send sites there call
// awaitResendSlot() first, so pacing lives in exactly one place. Callers must
// NOT add their own per-loop sleeps.
//
// Each caller reserves the next free slot synchronously (before any await),
// so concurrent sends inside one server instance are spaced out too, not just
// sequential ones. The first send never waits.
// ---------------------------------------------------------------------------
export const RESEND_MIN_INTERVAL_MS = 600

let nextResendSlotAt = 0

export async function awaitResendSlot(now: () => number = Date.now): Promise<void> {
  const slot = Math.max(now(), nextResendSlotAt)
  nextResendSlotAt = slot + RESEND_MIN_INTERVAL_MS
  const wait = slot - now()
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
}

/** Test-only: forget the last reserved slot. */
export function _resetResendSlotForTests() {
  nextResendSlotAt = 0
}

export function logEmailConfig() {
  console.log('Email config:', {
    hasApiKey: !!apiKey,
    fromAddress: EMAIL_FROM_ADDRESS,
    replyTo: EMAIL_REPLY_TO,
  })
}
