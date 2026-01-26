import { Resend } from 'resend'

// Initialize Resend client
// You'll need to add RESEND_API_KEY to your .env.local
export const resend = new Resend(process.env.RESEND_API_KEY)

// Default from address - update this to your verified domain
export const EMAIL_FROM = process.env.EMAIL_FROM || 'Podium <noreply@resend.dev>'
