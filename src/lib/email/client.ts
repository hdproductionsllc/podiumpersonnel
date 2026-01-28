import { Resend } from 'resend'

// Initialize Resend client
const apiKey = process.env.RESEND_API_KEY
if (!apiKey) {
  console.warn('⚠️ RESEND_API_KEY is not set - emails will not be sent')
}
export const resend = new Resend(apiKey)

// Default from address - requires verified domain in Resend
// Using "hello@" instead of "noreply@" for better deliverability
export const EMAIL_FROM = process.env.EMAIL_FROM || 'Podium Personnel <hello@podiumpersonnel.com>'

// Debug helper
export function logEmailConfig() {
  console.log('Email config:', {
    hasApiKey: !!apiKey,
    from: EMAIL_FROM,
  })
}
