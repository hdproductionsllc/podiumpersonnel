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

function sanitizeDisplayName(name: string): string {
  // RFC 5322 reserved chars + control chars stripped, collapsed whitespace
  return name.replace(/[<>"\r\n]/g, '').replace(/\s+/g, ' ').trim()
}

export function buildFromAddress(displayName?: string | null): string {
  const safe = displayName ? sanitizeDisplayName(displayName) : ''
  const name = safe || EMAIL_DEFAULT_FROM_NAME
  return `${name} <${EMAIL_FROM_ADDRESS}>`
}

export function logEmailConfig() {
  console.log('Email config:', {
    hasApiKey: !!apiKey,
    fromAddress: EMAIL_FROM_ADDRESS,
    replyTo: EMAIL_REPLY_TO,
  })
}
