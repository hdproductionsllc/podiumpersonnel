import { resend, EMAIL_FROM_ADDRESS, EMAIL_REPLY_TO, buildFromAddress, filterRecipients } from './client'
import { getOrgOwnerEmail } from '../supabase/server'
import type * as React from 'react'
import { ContractOfferEmail } from './templates/contract-offer'
import { OfferReminderEmail } from './templates/offer-reminder'
import { OfferAcceptedEmail } from './templates/offer-accepted'
import { OfferDeclinedEmail } from './templates/offer-declined'
import { OfferRescindedEmail } from './templates/offer-rescinded'
import { AdminOfferResponseEmail } from './templates/admin-offer-response'
import { AdminOfferSentEmail } from './templates/admin-offer-sent'
import { W9RequestEmail } from './templates/w9-request'
import { PositionUnassignedEmail } from './templates/position-unassigned'
import { AdminSubRequestEmail } from './templates/admin-sub-request'
import { SubRequestApprovedEmail } from './templates/sub-request-approved'
import { SubRequestDeclinedEmail } from './templates/sub-request-declined'
import { MusicianReleasedEmail } from './templates/musician-released'
import { SubDeclinedFindAnotherEmail } from './templates/sub-declined-find-another'
import { AdminWelcomeEmail } from './templates/admin-welcome'
import { OfferExpiredEmail } from './templates/offer-expired'
import { OfferExpiringSoonEmail } from './templates/offer-expiring-soon'
import { GigDetailsEmail } from './templates/gig-details'
import { GigDetailsReminderEmail } from './templates/gig-details-reminder'
import { MusicUploadedEmail } from './templates/music-uploaded'
import { MusicReminderEmail } from './templates/music-reminder'
import { PreGigNotificationEmail } from './templates/pre-gig-notification'
import { StaffingAlertEmail } from './templates/staffing-alert'
import { render } from '@react-email/render'
import { type EmailBranding } from './templates/email-layout'
import { type TermDictionary, DEFAULT_TERMS } from '@/lib/verticals'
import { getOrgVertical } from '@/lib/api-helpers'

export type { EmailBranding }

/**
 * Resolve the terminology dictionary for a send. Order of preference:
 * an explicit dictionary (call site already resolved it) > the sending org's
 * vertical (looked up from organizationId) > the built-in music default.
 * getOrgVertical already fail-opens to the default template, and we guard the
 * lookup so a terminology miss can never block a real email send.
 */
async function resolveEmailTerms(
  explicit: TermDictionary | undefined,
  organizationId: string | undefined
): Promise<TermDictionary> {
  if (explicit) return explicit
  if (organizationId) {
    try {
      return (await getOrgVertical(organizationId)).terms
    } catch {
      return DEFAULT_TERMS
    }
  }
  return DEFAULT_TERMS
}

/**
 * Extract a short performance date (e.g. "Mar 21") from formatted services for email subject lines.
 * Services have dates formatted like "Monday, March 21, 2026".
 */
function getSubjectDate(services?: { date?: string }[], performanceDate?: string): string {
  if (performanceDate) return performanceDate
  const dateStr = services?.[0]?.date
  if (!dateStr) return ''
  // Match "Month Day, Year" from "Weekday, Month Day, Year"
  const match = dateStr.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/)
  if (!match) return ''
  const SHORT: Record<string, string> = {
    January: 'Jan', February: 'Feb', March: 'Mar', April: 'Apr',
    May: 'May', June: 'Jun', July: 'Jul', August: 'Aug',
    September: 'Sep', October: 'Oct', November: 'Nov', December: 'Dec',
  }
  return `${SHORT[match[1]]} ${match[2]}`
}

/** Append " | Mar 21" to a subject line when a date is available */
function withDate(subject: string, date: string): string {
  return date ? `${subject} | ${date}` : subject
}

/**
 * Format a raw ISO date string (e.g. "2026-04-05T19:00:00Z") to a short "Apr 5" for subject lines.
 * Exported so call sites without pre-formatted services can compute performanceDate.
 */
export function formatPerformanceDateForSubject(isoDate: string, timezone?: string): string {
  try {
    const d = new Date(isoDate)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: timezone || 'UTC' })
  } catch {
    return ''
  }
}

/**
 * Centralized wrapper for transactional sends. Adds deliverability essentials
 * that every send needs: plain-text alternative, replyTo, and List-Unsubscribe
 * headers (Gmail/Outlook explicitly favor these). Preserves the original return
 * shape so callers continue to receive `{ ...data, emailHtml }`.
 *
 * Reply-To resolution order: explicit `replyTo` > org-owner lookup via
 * `replyToOrgId` > global default. For musician-facing emails, prefer
 * `replyToOrgId` so replies route to a real human at the org instead of
 * the unmonitored hello@ inbox.
 */
async function sendTransactional(args: {
  to: string | string[]
  subject: string
  react: React.ReactElement
  fromName?: string | null
  replyTo?: string
  replyToOrgId?: string | null
  errorContext: string
}) {
  const [emailHtml, emailText] = await Promise.all([
    render(args.react),
    render(args.react, { plainText: true }),
  ])

  let replyTo = args.replyTo
  if (!replyTo && args.replyToOrgId) {
    try {
      const ownerEmail = await getOrgOwnerEmail(args.replyToOrgId)
      if (ownerEmail) replyTo = ownerEmail
    } catch (lookupErr) {
      // Reply-To lookup is best-effort; don't block the send if it fails.
      console.warn(`Reply-To lookup failed for org ${args.replyToOrgId}:`, lookupErr)
    }
  }

  // Safe-mode gate: suppress non-allowlisted recipients during testing.
  const { allowed, suppressed } = filterRecipients(args.to)
  if (suppressed.length > 0) {
    console.log(
      `[EMAIL SUPPRESSED] (${args.errorContext}) "${args.subject}" → ${suppressed.join(', ')}`
    )
  }
  if (allowed.length === 0) {
    return { id: null, emailHtml, subject: args.subject }
  }

  const { data, error } = await resend.emails.send({
    from: buildFromAddress(args.fromName),
    to: allowed,
    subject: args.subject,
    html: emailHtml,
    text: emailText,
    replyTo: replyTo || EMAIL_REPLY_TO,
    headers: {
      'List-Unsubscribe': `<mailto:${EMAIL_FROM_ADDRESS}?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  })

  if (error) {
    console.error(`Failed to send ${args.errorContext} email:`, error)
    throw new Error(`Failed to send email: ${error.message}`)
  }

  return { ...data, emailHtml, subject: args.subject }
}

// Contract Offer Email
interface SendContractOfferParams {
  to: string
  musicianName: string
  organizationName: string
  organizationId?: string
  projectName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  services: {
    name: string
    date: string
    callTime?: string | null
    time: string
    endTime?: string | null
    venue: string | null
    venueUrl?: string | null
    venueAddress?: string | null
    venue2?: string | null
    venue2Url?: string | null
    venue2Address?: string | null
  }[]
  responseUrl: string
  expiresAt: string | null
  timezone?: string
  notes?: string | null
  payAmount?: number | null
  leaderFee?: number | null
  isLeader?: boolean
  personalMessage?: string
  ensembleType?: string | null
  branding?: EmailBranding
  terms?: TermDictionary
}

export async function sendContractOfferEmail(params: SendContractOfferParams) {
  const terms = await resolveEmailTerms(params.terms, params.organizationId)
  return sendTransactional({
    to: params.to,
    subject: withDate(`Call: ${params.projectName} - ${params.instrument}`, getSubjectDate(params.services)),
    react: ContractOfferEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      projectName: params.projectName,
      instrument: params.instrument,
      chairNumber: params.chairNumber,
      totalChairs: params.totalChairs,
      services: params.services,
      responseUrl: params.responseUrl,
      expiresAt: params.expiresAt,
      timezone: params.timezone,
      notes: params.notes,
      payAmount: params.payAmount,
      leaderFee: params.leaderFee,
      isLeader: params.isLeader,
      personalMessage: params.personalMessage,
      ensembleType: params.ensembleType,
      branding: params.branding,
      terms,
    }),
    fromName: params.organizationName,
    replyToOrgId: params.organizationId,
    errorContext: 'contract offer',
  })
}

// Offer Reminder Email
interface SendOfferReminderParams {
  to: string
  musicianName: string
  organizationName: string
  organizationId?: string
  projectName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  responseUrl: string
  expiresAt: string | null
  daysRemaining: number | null
  performanceDate?: string
  branding?: EmailBranding
  terms?: TermDictionary
}

export async function sendOfferReminderEmail(params: SendOfferReminderParams) {
  const terms = await resolveEmailTerms(params.terms, params.organizationId)
  return sendTransactional({
    to: params.to,
    subject: withDate(`Reminder: ${params.projectName} - response needed`, params.performanceDate || ''),
    react: OfferReminderEmail({
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
      terms,
    }),
    fromName: params.organizationName,
    replyToOrgId: params.organizationId,
    errorContext: 'offer reminder',
  })
}

// Offer Accepted Confirmation Email (to musician)
interface SendOfferAcceptedParams {
  to: string
  musicianName: string
  organizationName: string
  organizationId?: string
  contactEmail?: string
  projectName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  services: {
    name: string
    date: string
    time: string
    venue: string | null
    venueUrl?: string | null
    venueAddress?: string | null
    venue2?: string | null
    venue2Url?: string | null
    venue2Address?: string | null
  }[]
  calendarUrl?: string
  googleCalendarUrl?: string
  terms?: TermDictionary
}

export async function sendOfferAcceptedEmail(params: SendOfferAcceptedParams) {
  const terms = await resolveEmailTerms(params.terms, params.organizationId)
  return sendTransactional({
    to: params.to,
    subject: withDate(`Confirmed: You're booked for ${params.projectName}`, getSubjectDate(params.services)),
    react: OfferAcceptedEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      contactEmail: params.contactEmail,
      projectName: params.projectName,
      instrument: params.instrument,
      chairNumber: params.chairNumber,
      totalChairs: params.totalChairs,
      services: params.services,
      calendarUrl: params.calendarUrl,
      googleCalendarUrl: params.googleCalendarUrl,
      terms,
    }),
    fromName: params.organizationName,
    replyTo: params.contactEmail || undefined,
    replyToOrgId: params.organizationId,
    errorContext: 'offer accepted',
  })
}

// Offer Declined Confirmation Email (to musician)
interface SendOfferDeclinedParams {
  to: string
  musicianName: string
  organizationName: string
  organizationId?: string
  projectName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  declineReason?: string | null
  performanceDate?: string
  terms?: TermDictionary
}

export async function sendOfferDeclinedEmail(params: SendOfferDeclinedParams) {
  const terms = await resolveEmailTerms(params.terms, params.organizationId)
  return sendTransactional({
    to: params.to,
    subject: withDate(`Thank you for your response - ${params.projectName}`, params.performanceDate || ''),
    react: OfferDeclinedEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      projectName: params.projectName,
      instrument: params.instrument,
      chairNumber: params.chairNumber,
      totalChairs: params.totalChairs,
      declineReason: params.declineReason,
      terms,
    }),
    fromName: params.organizationName,
    replyToOrgId: params.organizationId,
    errorContext: 'offer declined',
  })
}

// Offer Rescinded Email (to musician — admin withdrew the offer)
interface SendOfferRescindedParams {
  to: string
  musicianName: string
  organizationName: string
  organizationId?: string
  projectName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  performanceDate?: string
  terms?: TermDictionary
}

export async function sendOfferRescindedEmail(params: SendOfferRescindedParams) {
  const terms = await resolveEmailTerms(params.terms, params.organizationId)
  return sendTransactional({
    to: params.to,
    subject: withDate(`Offer withdrawn - ${params.projectName}`, params.performanceDate || ''),
    react: OfferRescindedEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      projectName: params.projectName,
      instrument: params.instrument,
      chairNumber: params.chairNumber,
      totalChairs: params.totalChairs,
      terms,
    }),
    fromName: params.organizationName,
    replyToOrgId: params.organizationId,
    errorContext: 'offer rescinded',
  })
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
  status: 'accepted' | 'declined' | 'rescinded'
  responseNotes?: string | null
  dashboardUrl: string
  performanceDate?: string
  terms?: TermDictionary
}

export async function sendAdminOfferResponseEmail(params: SendAdminOfferResponseParams) {
  const terms = await resolveEmailTerms(params.terms, undefined)
  const statusText =
    params.status === 'accepted' ? 'Accepted'
    : params.status === 'rescinded' ? 'Rescinded'
    : 'Declined'

  return sendTransactional({
    to: params.to,
    subject: withDate(`Offer ${statusText}: ${params.musicianName} - ${params.projectName}`, params.performanceDate || ''),
    react: AdminOfferResponseEmail({
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
      terms,
    }),
    errorContext: 'admin offer response',
  })
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
    callTime?: string | null
    time: string
    endTime?: string | null
    venue: string | null
    venueUrl?: string | null
    venueAddress?: string | null
    venue2?: string | null
    venue2Url?: string | null
    venue2Address?: string | null
  }[]
  dashboardUrl: string
  payAmount?: number | null
  leaderFee?: number | null
  isLeader?: boolean
  personalMessage?: string | null
  expiresAt?: string | null
  ensembleType?: string | null
  timezone?: string
  terms?: TermDictionary
}

export async function sendAdminOfferSentEmail(params: SendAdminOfferSentParams) {
  const terms = await resolveEmailTerms(params.terms, undefined)
  return sendTransactional({
    to: params.to,
    subject: withDate(`Offer Sent: ${params.musicianName} - ${params.projectName}`, getSubjectDate(params.services)),
    react: AdminOfferSentEmail({
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
      payAmount: params.payAmount,
      leaderFee: params.leaderFee,
      isLeader: params.isLeader,
      personalMessage: params.personalMessage,
      expiresAt: params.expiresAt,
      ensembleType: params.ensembleType,
      timezone: params.timezone,
      terms,
    }),
    errorContext: 'admin offer sent',
  })
}

// W-9 Request Email
interface SendW9RequestParams {
  to: string
  musicianName: string
  organizationName: string
  organizationId?: string
  adminEmail?: string
  branding?: EmailBranding
  terms?: TermDictionary
}

export async function sendW9RequestEmail(params: SendW9RequestParams) {
  const terms = await resolveEmailTerms(params.terms, params.organizationId)
  return sendTransactional({
    to: params.to,
    subject: `W-9 Form Request - ${params.organizationName}`,
    react: W9RequestEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      adminEmail: params.adminEmail,
      branding: params.branding,
      terms,
    }),
    fromName: params.organizationName,
    replyTo: params.adminEmail || undefined,
    replyToOrgId: params.organizationId,
    errorContext: 'W-9 request',
  })
}

// Position Unassigned Email (to musician)
interface SendPositionUnassignedParams {
  to: string
  musicianName: string
  organizationName: string
  organizationId?: string
  projectName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  performanceDate?: string
  terms?: TermDictionary
}

export async function sendPositionUnassignedEmail(params: SendPositionUnassignedParams) {
  const terms = await resolveEmailTerms(params.terms, params.organizationId)
  return sendTransactional({
    to: params.to,
    subject: withDate(`Position Update: ${params.projectName}`, params.performanceDate || ''),
    react: PositionUnassignedEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      projectName: params.projectName,
      instrument: params.instrument,
      chairNumber: params.chairNumber,
      totalChairs: params.totalChairs,
      terms,
    }),
    fromName: params.organizationName,
    replyToOrgId: params.organizationId,
    errorContext: 'position unassigned',
  })
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
  performanceDate?: string
  terms?: TermDictionary
}

export async function sendAdminSubRequestEmail(params: SendAdminSubRequestParams) {
  const terms = await resolveEmailTerms(params.terms, undefined)
  return sendTransactional({
    to: params.to,
    subject: withDate(`Sub Request: ${params.musicianName} needs a sub for ${params.projectName}`, params.performanceDate || ''),
    react: AdminSubRequestEmail({
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
      terms,
    }),
    replyTo: params.musicianEmail || undefined,
    errorContext: 'admin sub request',
  })
}

// Sub Request Approved Email (to musician when admin approves)
interface SendSubRequestApprovedParams {
  to: string
  musicianName: string
  organizationName: string
  organizationId?: string
  projectName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  serviceName: string | null
  suggestedSubName: string
  performanceDate?: string
  terms?: TermDictionary
}

export async function sendSubRequestApprovedEmail(params: SendSubRequestApprovedParams) {
  const terms = await resolveEmailTerms(params.terms, params.organizationId)
  return sendTransactional({
    to: params.to,
    subject: withDate(`Sub Request Approved: ${params.projectName}`, params.performanceDate || ''),
    react: SubRequestApprovedEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      projectName: params.projectName,
      instrument: params.instrument,
      chairNumber: params.chairNumber,
      totalChairs: params.totalChairs,
      serviceName: params.serviceName,
      suggestedSubName: params.suggestedSubName,
      terms,
    }),
    fromName: params.organizationName,
    replyToOrgId: params.organizationId,
    errorContext: 'sub request approved',
  })
}

// Sub Request Declined Email (to musician when admin declines)
interface SendSubRequestDeclinedParams {
  to: string
  musicianName: string
  organizationName: string
  organizationId?: string
  projectName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  serviceName: string | null
  suggestedSubName: string
  adminNotes: string | null
  gigUrl: string
  performanceDate?: string
  terms?: TermDictionary
}

export async function sendSubRequestDeclinedEmail(params: SendSubRequestDeclinedParams) {
  const terms = await resolveEmailTerms(params.terms, params.organizationId)
  return sendTransactional({
    to: params.to,
    subject: withDate(`Sub Request Declined: ${params.projectName} - please find another substitute`, params.performanceDate || ''),
    react: SubRequestDeclinedEmail({
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
      terms,
    }),
    fromName: params.organizationName,
    replyToOrgId: params.organizationId,
    errorContext: 'sub request declined',
  })
}

// Musician Released Email (to original musician when sub accepts)
interface SendMusicianReleasedParams {
  to: string
  musicianName: string
  organizationName: string
  organizationId?: string
  projectName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  serviceName: string | null
  substituteName: string
  performanceDate?: string
  terms?: TermDictionary
}

export async function sendMusicianReleasedEmail(params: SendMusicianReleasedParams) {
  const terms = await resolveEmailTerms(params.terms, params.organizationId)
  return sendTransactional({
    to: params.to,
    subject: withDate(`You've been released: ${params.projectName}`, params.performanceDate || ''),
    react: MusicianReleasedEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      projectName: params.projectName,
      instrument: params.instrument,
      chairNumber: params.chairNumber,
      totalChairs: params.totalChairs,
      serviceName: params.serviceName,
      substituteName: params.substituteName,
      terms,
    }),
    fromName: params.organizationName,
    replyToOrgId: params.organizationId,
    errorContext: 'musician released',
  })
}

// Sub Declined Find Another Email (to original musician when sub declines)
interface SendSubDeclinedFindAnotherParams {
  to: string
  musicianName: string
  organizationName: string
  organizationId?: string
  projectName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  serviceName: string | null
  suggestedSubName: string
  gigUrl: string
  performanceDate?: string
  terms?: TermDictionary
}

export async function sendSubDeclinedFindAnotherEmail(params: SendSubDeclinedFindAnotherParams) {
  const terms = await resolveEmailTerms(params.terms, params.organizationId)
  return sendTransactional({
    to: params.to,
    subject: withDate(`Your sub declined - ${params.projectName}`, params.performanceDate || ''),
    react: SubDeclinedFindAnotherEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      projectName: params.projectName,
      instrument: params.instrument,
      chairNumber: params.chairNumber,
      totalChairs: params.totalChairs,
      serviceName: params.serviceName,
      suggestedSubName: params.suggestedSubName,
      gigUrl: params.gigUrl,
      terms,
    }),
    fromName: params.organizationName,
    replyToOrgId: params.organizationId,
    errorContext: 'sub declined find another',
  })
}

// Portal invitation and musician welcome emails were removed with the musician
// portal. Both existed only to get a musician to create an account; musicians
// now do everything from the tokenized links already in their gig emails.

// Offer Expired Notification Email (to admins)
interface SendOfferExpiredParams {
  to: string | string[]
  organizationName: string
  projectName: string
  musicianName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  nextCandidate: {
    name: string
    email: string
    callOrder: number | null
  } | null
  dashboardUrl: string
  performanceDate?: string
  terms?: TermDictionary
}

export async function sendOfferExpiredEmail(params: SendOfferExpiredParams) {
  const terms = await resolveEmailTerms(params.terms, undefined)
  return sendTransactional({
    to: params.to,
    subject: withDate(`Offer Expired: ${params.musicianName} - ${params.projectName}`, params.performanceDate || ''),
    react: OfferExpiredEmail({
      organizationName: params.organizationName,
      projectName: params.projectName,
      musicianName: params.musicianName,
      instrument: params.instrument,
      chairNumber: params.chairNumber,
      totalChairs: params.totalChairs,
      nextCandidate: params.nextCandidate,
      dashboardUrl: params.dashboardUrl,
      terms,
    }),
    errorContext: 'offer expired',
  })
}

// Offer Expiring Soon Notification Email (to admins — 24hr warning)
interface SendOfferExpiringSoonParams {
  to: string | string[]
  organizationName: string
  projectName: string
  musicianName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  hoursRemaining: number
  dashboardUrl: string
  performanceDate?: string
  terms?: TermDictionary
}

export async function sendOfferExpiringSoonEmail(params: SendOfferExpiringSoonParams) {
  const terms = await resolveEmailTerms(params.terms, undefined)
  return sendTransactional({
    to: params.to,
    subject: withDate(`Offer expiring soon: ${params.musicianName} hasn't responded - ${params.projectName}`, params.performanceDate || ''),
    react: OfferExpiringSoonEmail({
      organizationName: params.organizationName,
      projectName: params.projectName,
      musicianName: params.musicianName,
      instrument: params.instrument,
      chairNumber: params.chairNumber,
      totalChairs: params.totalChairs,
      hoursRemaining: params.hoursRemaining,
      dashboardUrl: params.dashboardUrl,
      terms,
    }),
    errorContext: 'offer expiring soon',
  })
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

  // Safe-mode gate: suppress non-allowlisted recipients during testing.
  const { allowed, suppressed } = filterRecipients(to)
  if (suppressed.length > 0) {
    console.log(`[EMAIL SUPPRESSED] (generic) "${subject}" → ${suppressed.join(', ')}`)
  }
  if (allowed.length === 0) {
    return { id: null, emailHtml: html }
  }

  const { data, error } = await resend.emails.send({
    from: buildFromAddress(),
    to: allowed,
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    replyTo: EMAIL_REPLY_TO,
    headers: {
      'List-Unsubscribe': `<mailto:${EMAIL_FROM_ADDRESS}?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  })

  if (error) {
    console.error('Failed to send email:', error)
    throw new Error(`Failed to send email: ${error.message}`)
  }

  return { ...data, emailHtml: html }
}

// Admin Welcome Email (sent after org creation)
interface SendAdminWelcomeParams {
  to: string
  userName: string
  organizationName: string
  dashboardUrl: string
  terms?: TermDictionary
}

export async function sendAdminWelcomeEmail(params: SendAdminWelcomeParams) {
  const terms = await resolveEmailTerms(params.terms, undefined)
  return sendTransactional({
    to: params.to,
    subject: `Welcome to Podium - ${params.organizationName} is ready`,
    react: AdminWelcomeEmail({
      userName: params.userName,
      organizationName: params.organizationName,
      dashboardUrl: params.dashboardUrl,
      terms,
    }),
    errorContext: 'admin welcome',
  })
}

// Gig Details Email
interface SendGigDetailsEmailParams {
  to: string
  musicianName: string
  organizationName: string
  organizationId?: string
  projectName: string
  ensembleType: string | null
  services: {
    name: string
    date: string
    callTime?: string | null
    time: string
    endTime?: string | null
    venue: string | null
    venueUrl?: string | null
    venue2?: string | null
    venue2Url?: string | null
    parkingInfo?: string | null
    directions?: string | null
    parkingInfo2?: string | null
    directions2?: string | null
  }[]
  roster: {
    name: string
    instrument: string
    email: string
    phone: string | null
    isRecipient: boolean
  }[]
  confirmUrl: string
  notes?: string
  branding?: EmailBranding
  terms?: TermDictionary
}

export async function sendGigDetailsEmail(params: SendGigDetailsEmailParams) {
  const terms = await resolveEmailTerms(params.terms, params.organizationId)
  return sendTransactional({
    to: params.to,
    subject: withDate(`Gig details: ${params.projectName}`, getSubjectDate(params.services)),
    react: GigDetailsEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      projectName: params.projectName,
      ensembleType: params.ensembleType,
      services: params.services,
      roster: params.roster,
      confirmUrl: params.confirmUrl,
      notes: params.notes,
      branding: params.branding,
      terms,
    }),
    fromName: params.organizationName,
    replyToOrgId: params.organizationId,
    errorContext: 'gig details',
  })
}

// Gig Details Reminder Email
interface SendGigDetailsReminderEmailParams {
  to: string
  musicianName: string
  organizationName: string
  organizationId?: string
  projectName: string
  services: {
    name: string
    date: string
    venue: string | null
    venueUrl?: string | null
    venueAddress?: string | null
    venue2?: string | null
    venue2Url?: string | null
    venue2Address?: string | null
  }[]
  confirmUrl: string
  originalSentDate: string
  branding?: EmailBranding
  terms?: TermDictionary
}

export async function sendGigDetailsReminderEmail(params: SendGigDetailsReminderEmailParams) {
  const terms = await resolveEmailTerms(params.terms, params.organizationId)
  return sendTransactional({
    to: params.to,
    subject: withDate(`Reminder: please confirm ${params.projectName}`, getSubjectDate(params.services)),
    react: GigDetailsReminderEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      projectName: params.projectName,
      services: params.services,
      confirmUrl: params.confirmUrl,
      originalSentDate: params.originalSentDate,
      branding: params.branding,
      terms,
    }),
    fromName: params.organizationName,
    replyToOrgId: params.organizationId,
    errorContext: 'gig details reminder',
  })
}

// Music Uploaded Email
interface SendMusicUploadedEmailParams {
  to: string
  musicianName: string
  organizationName: string
  organizationId?: string
  projectName: string
  files: { name: string; size: number; downloadUrl: string }[]
  confirmUrl: string
  notes?: string
  contactEmail?: string
  performanceDate?: string
  branding?: EmailBranding
  terms?: TermDictionary
}

export async function sendMusicUploadedEmail(params: SendMusicUploadedEmailParams) {
  const terms = await resolveEmailTerms(params.terms, params.organizationId)
  return sendTransactional({
    to: params.to,
    subject: withDate(`Music available: ${params.projectName}`, params.performanceDate || ''),
    react: MusicUploadedEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      projectName: params.projectName,
      files: params.files,
      confirmUrl: params.confirmUrl,
      notes: params.notes,
      contactEmail: params.contactEmail,
      branding: params.branding,
      terms,
    }),
    fromName: params.organizationName,
    replyTo: params.contactEmail || undefined,
    replyToOrgId: params.organizationId,
    errorContext: 'music uploaded',
  })
}

// Music Reminder Email
interface SendMusicReminderEmailParams {
  to: string
  musicianName: string
  organizationName: string
  organizationId?: string
  projectName: string
  files: { name: string; size: number; downloadUrl: string }[]
  confirmUrl: string
  contactEmail?: string
  performanceDate?: string
  branding?: EmailBranding
  terms?: TermDictionary
}

export async function sendMusicReminderEmail(params: SendMusicReminderEmailParams) {
  const terms = await resolveEmailTerms(params.terms, params.organizationId)
  return sendTransactional({
    to: params.to,
    subject: withDate(`Reminder: download your music for ${params.projectName}`, params.performanceDate || ''),
    react: MusicReminderEmail({
      musicianName: params.musicianName,
      organizationName: params.organizationName,
      projectName: params.projectName,
      files: params.files,
      confirmUrl: params.confirmUrl,
      contactEmail: params.contactEmail,
      branding: params.branding,
      terms,
    }),
    fromName: params.organizationName,
    replyTo: params.contactEmail || undefined,
    replyToOrgId: params.organizationId,
    errorContext: 'music reminder',
  })
}

// Pre-Gig Notification Email (to org owners)
interface SendPreGigNotificationEmailParams {
  to: string | string[]
  organizationName: string
  projectName: string
  gigDate: string
  venueName: string | null
  musicianCount: number
  gigDetailsSent: boolean
  musicSent: boolean
  reviewUrl: string
  branding?: EmailBranding
  terms?: TermDictionary
}

export async function sendPreGigNotificationEmail(params: SendPreGigNotificationEmailParams) {
  const terms = await resolveEmailTerms(params.terms, undefined)
  return sendTransactional({
    to: params.to,
    subject: withDate(`Upcoming: ${params.projectName} is in 2 days - review reminder`, params.gigDate || ''),
    react: PreGigNotificationEmail({
      organizationName: params.organizationName,
      projectName: params.projectName,
      gigDate: params.gigDate,
      venueName: params.venueName,
      musicianCount: params.musicianCount,
      gigDetailsSent: params.gigDetailsSent,
      musicSent: params.musicSent,
      reviewUrl: params.reviewUrl,
      branding: params.branding,
      terms,
    }),
    errorContext: 'pre-gig notification',
  })
}

// Staffing Alert Email (to org admins when gig is understaffed)
interface SendStaffingAlertParams {
  to: string | string[]
  organizationName: string
  projectName: string
  gigDate: string
  venueName: string | null
  daysAway: number
  totalPositions: number
  confirmedCount: number
  unfilledPositions: {
    instrument: string
    chairNumber: number
    status: 'vacant' | 'offered' | 'declined'
  }[]
  dashboardUrl: string
  branding?: EmailBranding
  terms?: TermDictionary
}

export async function sendStaffingAlertEmail(params: SendStaffingAlertParams) {
  const terms = await resolveEmailTerms(params.terms, undefined)
  const urgencyLabel =
    params.daysAway <= 3 ? 'Heads up' : params.daysAway <= 7 ? 'Heads up' : 'Heads up'

  return sendTransactional({
    to: params.to,
    subject: withDate(`${urgencyLabel}: ${params.projectName} has ${params.unfilledPositions.length} unfilled positions`, params.gigDate || ''),
    react: StaffingAlertEmail({
      organizationName: params.organizationName,
      projectName: params.projectName,
      gigDate: params.gigDate,
      venueName: params.venueName,
      daysAway: params.daysAway,
      totalPositions: params.totalPositions,
      confirmedCount: params.confirmedCount,
      unfilledPositions: params.unfilledPositions,
      dashboardUrl: params.dashboardUrl,
      branding: params.branding,
      terms,
    }),
    errorContext: 'staffing alert',
  })
}
