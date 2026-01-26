import { resend, EMAIL_FROM } from './client'
import { ContractOfferEmail } from './templates/contract-offer'
import { OfferReminderEmail } from './templates/offer-reminder'
import { OfferAcceptedEmail } from './templates/offer-accepted'
import { OfferDeclinedEmail } from './templates/offer-declined'
import { AdminOfferResponseEmail } from './templates/admin-offer-response'
import { W9RequestEmail } from './templates/w9-request'
import { render } from '@react-email/render'

// Contract Offer Email
interface SendContractOfferParams {
  to: string
  musicianName: string
  organizationName: string
  projectName: string
  instrument: string
  chairNumber: number
  services: {
    name: string
    date: string
    time: string
    venue: string | null
  }[]
  responseUrl: string
  expiresAt: string | null
  notes?: string | null
}

export async function sendContractOfferEmail(params: SendContractOfferParams) {
  const emailHtml = await render(
    ContractOfferEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      projectName: params.projectName,
      instrument: params.instrument,
      chairNumber: params.chairNumber,
      services: params.services,
      responseUrl: params.responseUrl,
      expiresAt: params.expiresAt,
      notes: params.notes,
    })
  )

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: params.to,
    subject: `Contract Offer: ${params.projectName} - ${params.instrument}`,
    html: emailHtml,
  })

  if (error) {
    console.error('Failed to send contract offer email:', error)
    throw new Error(`Failed to send email: ${error.message}`)
  }

  return data
}

// Offer Reminder Email
interface SendOfferReminderParams {
  to: string
  musicianName: string
  organizationName: string
  projectName: string
  instrument: string
  chairNumber: number
  responseUrl: string
  expiresAt: string | null
  daysRemaining: number | null
}

export async function sendOfferReminderEmail(params: SendOfferReminderParams) {
  const emailHtml = await render(
    OfferReminderEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      projectName: params.projectName,
      instrument: params.instrument,
      chairNumber: params.chairNumber,
      responseUrl: params.responseUrl,
      expiresAt: params.expiresAt,
      daysRemaining: params.daysRemaining,
    })
  )

  const urgentPrefix = params.daysRemaining !== null && params.daysRemaining <= 2 ? '⚠️ URGENT: ' : ''

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: params.to,
    subject: `${urgentPrefix}Reminder: Contract Offer for ${params.projectName}`,
    html: emailHtml,
  })

  if (error) {
    console.error('Failed to send offer reminder email:', error)
    throw new Error(`Failed to send email: ${error.message}`)
  }

  return data
}

// Offer Accepted Confirmation Email (to musician)
interface SendOfferAcceptedParams {
  to: string
  musicianName: string
  organizationName: string
  projectName: string
  instrument: string
  chairNumber: number
  services: {
    name: string
    date: string
    time: string
    venue: string | null
  }[]
  calendarUrl?: string
}

export async function sendOfferAcceptedEmail(params: SendOfferAcceptedParams) {
  const emailHtml = await render(
    OfferAcceptedEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      projectName: params.projectName,
      instrument: params.instrument,
      chairNumber: params.chairNumber,
      services: params.services,
      calendarUrl: params.calendarUrl,
    })
  )

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: params.to,
    subject: `Confirmed: You're booked for ${params.projectName}`,
    html: emailHtml,
  })

  if (error) {
    console.error('Failed to send offer accepted email:', error)
    throw new Error(`Failed to send email: ${error.message}`)
  }

  return data
}

// Offer Declined Confirmation Email (to musician)
interface SendOfferDeclinedParams {
  to: string
  musicianName: string
  organizationName: string
  projectName: string
  instrument: string
  chairNumber: number
  declineReason?: string | null
}

export async function sendOfferDeclinedEmail(params: SendOfferDeclinedParams) {
  const emailHtml = await render(
    OfferDeclinedEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      projectName: params.projectName,
      instrument: params.instrument,
      chairNumber: params.chairNumber,
      declineReason: params.declineReason,
    })
  )

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: params.to,
    subject: `Thank you for your response - ${params.projectName}`,
    html: emailHtml,
  })

  if (error) {
    console.error('Failed to send offer declined email:', error)
    throw new Error(`Failed to send email: ${error.message}`)
  }

  return data
}

// Admin Notification Email (when musician responds)
interface SendAdminOfferResponseParams {
  to: string | string[]
  adminName?: string
  organizationName: string
  projectName: string
  musicianName: string
  musicianEmail: string | null
  instrument: string
  chairNumber: number
  status: 'accepted' | 'declined'
  responseNotes?: string | null
  dashboardUrl: string
}

export async function sendAdminOfferResponseEmail(params: SendAdminOfferResponseParams) {
  const emailHtml = await render(
    AdminOfferResponseEmail({
      adminName: params.adminName,
      organizationName: params.organizationName,
      projectName: params.projectName,
      musicianName: params.musicianName,
      musicianEmail: params.musicianEmail,
      instrument: params.instrument,
      chairNumber: params.chairNumber,
      status: params.status,
      responseNotes: params.responseNotes,
      dashboardUrl: params.dashboardUrl,
    })
  )

  const statusText = params.status === 'accepted' ? 'Accepted' : 'Declined'

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: params.to,
    subject: `Offer ${statusText}: ${params.musicianName} - ${params.projectName}`,
    html: emailHtml,
  })

  if (error) {
    console.error('Failed to send admin notification email:', error)
    throw new Error(`Failed to send email: ${error.message}`)
  }

  return data
}

// W-9 Request Email
interface SendW9RequestParams {
  to: string
  musicianName: string
  organizationName: string
  adminEmail?: string
}

export async function sendW9RequestEmail(params: SendW9RequestParams) {
  const emailHtml = await render(
    W9RequestEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      adminEmail: params.adminEmail,
    })
  )

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: params.to,
    subject: `W-9 Form Request - ${params.organizationName}`,
    html: emailHtml,
  })

  if (error) {
    console.error('Failed to send W-9 request email:', error)
    throw new Error(`Failed to send email: ${error.message}`)
  }

  return data
}

// Generic email sending function
interface SendEmailParams {
  to: string | string[]
  subject: string
  html: string
  text?: string
}

export async function sendEmail(params: SendEmailParams) {
  const { to, subject, html, text } = params

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject,
    html,
    text,
  })

  if (error) {
    console.error('Failed to send email:', error)
    throw new Error(`Failed to send email: ${error.message}`)
  }

  return data
}
