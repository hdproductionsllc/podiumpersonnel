import { resend, EMAIL_FROM } from './client'
import { ContractOfferEmail } from './templates/contract-offer'
import { OfferReminderEmail } from './templates/offer-reminder'
import { OfferAcceptedEmail } from './templates/offer-accepted'
import { OfferDeclinedEmail } from './templates/offer-declined'
import { AdminOfferResponseEmail } from './templates/admin-offer-response'
import { AdminOfferSentEmail } from './templates/admin-offer-sent'
import { W9RequestEmail } from './templates/w9-request'
import { PositionUnassignedEmail } from './templates/position-unassigned'
import { AdminSubRequestEmail } from './templates/admin-sub-request'
import { SubRequestApprovedEmail } from './templates/sub-request-approved'
import { SubRequestDeclinedEmail } from './templates/sub-request-declined'
import { MusicianReleasedEmail } from './templates/musician-released'
import { SubDeclinedFindAnotherEmail } from './templates/sub-declined-find-another'
import { PortalInvitationEmail } from './templates/portal-invitation'
import { MusicianWelcomeEmail } from './templates/musician-welcome'
import { render } from '@react-email/render'
import { type EmailBranding } from './templates/email-layout'

export type { EmailBranding }

// Contract Offer Email
interface SendContractOfferParams {
  to: string
  musicianName: string
  organizationName: string
  projectName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  services: {
    name: string
    date: string
    time: string
    venue: string | null
  }[]
  responseUrl: string
  expiresAt: string | null
  notes?: string | null
  branding?: EmailBranding
}

export async function sendContractOfferEmail(params: SendContractOfferParams) {
  const emailHtml = await render(
    ContractOfferEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      projectName: params.projectName,
      instrument: params.instrument,
      chairNumber: params.chairNumber,
      totalChairs: params.totalChairs,
      services: params.services,
      responseUrl: params.responseUrl,
      expiresAt: params.expiresAt,
      notes: params.notes,
      branding: params.branding,
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
  totalChairs?: number
  responseUrl: string
  expiresAt: string | null
  daysRemaining: number | null
  branding?: EmailBranding
}

export async function sendOfferReminderEmail(params: SendOfferReminderParams) {
  const emailHtml = await render(
    OfferReminderEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      projectName: params.projectName,
      instrument: params.instrument,
      chairNumber: params.chairNumber,
      totalChairs: params.totalChairs,
      responseUrl: params.responseUrl,
      expiresAt: params.expiresAt,
      daysRemaining: params.daysRemaining,
      branding: params.branding,
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
  totalChairs?: number
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
      totalChairs: params.totalChairs,
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
  totalChairs?: number
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
      totalChairs: params.totalChairs,
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
  totalChairs?: number
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
      totalChairs: params.totalChairs,
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

// Admin Notification Email (when offer is sent)
interface SendAdminOfferSentParams {
  to: string | string[]
  adminName?: string
  organizationName: string
  projectName: string
  musicianName: string
  musicianEmail: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  services: {
    name: string
    date: string
    time: string
    venue: string | null
  }[]
  dashboardUrl: string
}

export async function sendAdminOfferSentEmail(params: SendAdminOfferSentParams) {
  const emailHtml = await render(
    AdminOfferSentEmail({
      adminName: params.adminName,
      organizationName: params.organizationName,
      projectName: params.projectName,
      musicianName: params.musicianName,
      musicianEmail: params.musicianEmail,
      instrument: params.instrument,
      chairNumber: params.chairNumber,
      totalChairs: params.totalChairs,
      services: params.services,
      dashboardUrl: params.dashboardUrl,
    })
  )

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: params.to,
    subject: `Offer Sent: ${params.musicianName} - ${params.projectName}`,
    html: emailHtml,
  })

  if (error) {
    console.error('Failed to send admin offer sent email:', error)
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
  branding?: EmailBranding
}

export async function sendW9RequestEmail(params: SendW9RequestParams) {
  const emailHtml = await render(
    W9RequestEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      adminEmail: params.adminEmail,
      branding: params.branding,
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

// Position Unassigned Email (to musician)
interface SendPositionUnassignedParams {
  to: string
  musicianName: string
  organizationName: string
  projectName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
}

export async function sendPositionUnassignedEmail(params: SendPositionUnassignedParams) {
  const emailHtml = await render(
    PositionUnassignedEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      projectName: params.projectName,
      instrument: params.instrument,
      chairNumber: params.chairNumber,
      totalChairs: params.totalChairs,
    })
  )

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: params.to,
    subject: `Position Update: ${params.projectName}`,
    html: emailHtml,
  })

  if (error) {
    console.error('Failed to send position unassigned email:', error)
    throw new Error(`Failed to send email: ${error.message}`)
  }

  return data
}

// Admin Sub Request Email (to admins when musician requests a sub)
interface SendAdminSubRequestParams {
  to: string | string[]
  adminName?: string
  organizationName: string
  projectName: string
  musicianName: string
  musicianEmail: string | null
  instrument: string
  chairNumber: number
  totalChairs?: number
  serviceName: string | null
  reason: string | null
  suggestedSubName: string
  suggestedSubEmail: string
  suggestedSubPhone: string | null
  suggestedSubInstrument: string
  dashboardUrl: string
}

export async function sendAdminSubRequestEmail(params: SendAdminSubRequestParams) {
  const emailHtml = await render(
    AdminSubRequestEmail({
      adminName: params.adminName,
      organizationName: params.organizationName,
      projectName: params.projectName,
      musicianName: params.musicianName,
      musicianEmail: params.musicianEmail,
      instrument: params.instrument,
      chairNumber: params.chairNumber,
      totalChairs: params.totalChairs,
      serviceName: params.serviceName,
      reason: params.reason,
      suggestedSubName: params.suggestedSubName,
      suggestedSubEmail: params.suggestedSubEmail,
      suggestedSubPhone: params.suggestedSubPhone,
      suggestedSubInstrument: params.suggestedSubInstrument,
      dashboardUrl: params.dashboardUrl,
    })
  )

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: params.to,
    subject: `Sub Request: ${params.musicianName} needs a sub for ${params.projectName}`,
    html: emailHtml,
  })

  if (error) {
    console.error('Failed to send admin sub request email:', error)
    throw new Error(`Failed to send email: ${error.message}`)
  }

  return data
}

// Sub Request Approved Email (to musician when admin approves)
interface SendSubRequestApprovedParams {
  to: string
  musicianName: string
  organizationName: string
  projectName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  serviceName: string | null
  suggestedSubName: string
}

export async function sendSubRequestApprovedEmail(params: SendSubRequestApprovedParams) {
  const emailHtml = await render(
    SubRequestApprovedEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      projectName: params.projectName,
      instrument: params.instrument,
      chairNumber: params.chairNumber,
      totalChairs: params.totalChairs,
      serviceName: params.serviceName,
      suggestedSubName: params.suggestedSubName,
    })
  )

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: params.to,
    subject: `Sub Request Approved: ${params.projectName}`,
    html: emailHtml,
  })

  if (error) {
    console.error('Failed to send sub request approved email:', error)
    throw new Error(`Failed to send email: ${error.message}`)
  }

  return data
}

// Sub Request Declined Email (to musician when admin declines)
interface SendSubRequestDeclinedParams {
  to: string
  musicianName: string
  organizationName: string
  projectName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  serviceName: string | null
  suggestedSubName: string
  adminNotes: string | null
  gigUrl: string
}

export async function sendSubRequestDeclinedEmail(params: SendSubRequestDeclinedParams) {
  const emailHtml = await render(
    SubRequestDeclinedEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      projectName: params.projectName,
      instrument: params.instrument,
      chairNumber: params.chairNumber,
      totalChairs: params.totalChairs,
      serviceName: params.serviceName,
      suggestedSubName: params.suggestedSubName,
      adminNotes: params.adminNotes,
      gigUrl: params.gigUrl,
    })
  )

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: params.to,
    subject: `Sub Request Declined: ${params.projectName} - Please find another substitute`,
    html: emailHtml,
  })

  if (error) {
    console.error('Failed to send sub request declined email:', error)
    throw new Error(`Failed to send email: ${error.message}`)
  }

  return data
}

// Musician Released Email (to original musician when sub accepts)
interface SendMusicianReleasedParams {
  to: string
  musicianName: string
  organizationName: string
  projectName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  serviceName: string | null
  substituteName: string
}

export async function sendMusicianReleasedEmail(params: SendMusicianReleasedParams) {
  const emailHtml = await render(
    MusicianReleasedEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      projectName: params.projectName,
      instrument: params.instrument,
      chairNumber: params.chairNumber,
      totalChairs: params.totalChairs,
      serviceName: params.serviceName,
      substituteName: params.substituteName,
    })
  )

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: params.to,
    subject: `You've Been Released: ${params.projectName}`,
    html: emailHtml,
  })

  if (error) {
    console.error('Failed to send musician released email:', error)
    throw new Error(`Failed to send email: ${error.message}`)
  }

  return data
}

// Sub Declined Find Another Email (to original musician when sub declines)
interface SendSubDeclinedFindAnotherParams {
  to: string
  musicianName: string
  organizationName: string
  projectName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  serviceName: string | null
  suggestedSubName: string
  gigUrl: string
}

export async function sendSubDeclinedFindAnotherEmail(params: SendSubDeclinedFindAnotherParams) {
  const emailHtml = await render(
    SubDeclinedFindAnotherEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      projectName: params.projectName,
      instrument: params.instrument,
      chairNumber: params.chairNumber,
      totalChairs: params.totalChairs,
      serviceName: params.serviceName,
      suggestedSubName: params.suggestedSubName,
      gigUrl: params.gigUrl,
    })
  )

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: params.to,
    subject: `Action Required: Your sub declined - ${params.projectName}`,
    html: emailHtml,
  })

  if (error) {
    console.error('Failed to send sub declined find another email:', error)
    throw new Error(`Failed to send email: ${error.message}`)
  }

  return data
}

// Portal Invitation Email
interface SendPortalInvitationParams {
  to: string
  musicianName: string
  organizationName: string
  activationUrl: string
  expiresAt: string
  branding?: EmailBranding
}

export async function sendPortalInvitationEmail(params: SendPortalInvitationParams) {
  const emailHtml = await render(
    PortalInvitationEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      activationUrl: params.activationUrl,
      expiresAt: params.expiresAt,
      branding: params.branding,
    })
  )

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: params.to,
    subject: `${params.organizationName} has invited you to Podium`,
    html: emailHtml,
  })

  if (error) {
    console.error('Failed to send portal invitation email:', error)
    throw new Error(`Failed to send email: ${error.message}`)
  }

  return data
}

// Musician Welcome Email
interface SendMusicianWelcomeParams {
  to: string
  musicianName: string
  loginUrl: string
  organizations: string[]
}

export async function sendMusicianWelcomeEmail(params: SendMusicianWelcomeParams) {
  const emailHtml = await render(
    MusicianWelcomeEmail({
      musicianName: params.musicianName,
      email: params.to,
      loginUrl: params.loginUrl,
      organizations: params.organizations,
    })
  )

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: params.to,
    subject: 'Welcome to Podium - Your musician portal is ready',
    html: emailHtml,
  })

  if (error) {
    console.error('Failed to send musician welcome email:', error)
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
