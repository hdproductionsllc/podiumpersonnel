/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * After the gig: the two sends, each safe to call any number of times.
 *
 *   sendPaySummaryOnce   claims projects.pay_summary_sent_at BEFORE sending, so
 *                        two overlapping runs can never both send; releases the
 *                        claim if the send throws, so the next run retries.
 *   requestGigReports    one gig_reports row per (project, lead); a lead who
 *                        already has a row is not asked again unless `force`
 *                        (the admin's "Send again" button).
 *
 * Recipients: the pay summary and the submitted-report email go ONLY to
 * getOrgAdminEmails (organization_members owner/admin). Musicians' addresses
 * are read here for exactly one thing: the report REQUEST to the lead, which
 * carries no pay information.
 */

import { randomBytes } from 'crypto'
import { getOrgAdminEmails } from '@/lib/supabase/server'
import { sendGigReportRequestEmail, sendPaySummaryEmail } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'
import { buildPaySummary, gigEndedAt, gigLeads } from './rules'

type Supabase = any

/** Everything both sends read about a project, in one select. */
export const AFTER_GIG_PROJECT_SELECT = `
  id,
  name,
  status,
  organization_id,
  pay_summary_sent_at,
  organization:organizations(id, name, timezone, email_logo_url, email_brand_color, email_footer_text),
  services(id, name, start_time, end_time, base_pay, leader_fee),
  project_positions(
    id,
    status,
    musician_id,
    instrument:instruments(name),
    musician:musicians(id, first_name, last_name, email, is_leader),
    contract_offers(custom_pay, status)
  )
`

function branding(org: any) {
  return {
    logoUrl: org?.email_logo_url,
    brandColor: org?.email_brand_color,
    footerText: org?.email_footer_text,
  }
}

export function gigDateLabel(project: any): string {
  const ended = gigEndedAt(project.services)
  const services = (project.services || []) as { start_time: string }[]
  const first = services.map((s) => s.start_time).sort()[0]
  const when = first || ended?.toISOString()
  if (!when) return ''
  return new Date(when).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: project.organization?.timezone || DEFAULT_TIMEZONE,
  })
}

export async function sendPaySummaryOnce(supabase: Supabase, project: any): Promise<'sent' | 'suppressed' | 'skipped' | 'failed'> {
  const { lines, grandTotal } = buildPaySummary(project.services, project.project_positions)
  if (lines.length === 0) return 'skipped' // nobody confirmed: nothing to pay

  const claimedAt = new Date().toISOString()
  const { data: claimed, error: claimError } = await supabase
    .from('projects')
    .update({ pay_summary_sent_at: claimedAt })
    .eq('id', project.id)
    .is('pay_summary_sent_at', null)
    .select('id')
  if (claimError) {
    console.error(`After-gig: could not claim pay summary for project ${project.id}:`, claimError)
    return 'failed'
  }
  if (!claimed || claimed.length === 0) return 'skipped' // already sent, or another run has it

  const adminEmails = await getOrgAdminEmails(project.organization_id)
  if (adminEmails.length === 0) {
    console.warn(`After-gig: org ${project.organization_id} has no owner/admin email; pay summary for ${project.id} not sent`)
    return 'skipped'
  }

  const org = project.organization
  try {
    const result = await sendPaySummaryEmail({
      adminEmails,
      organizationName: org?.name || 'Your organization',
      projectName: project.name,
      gigDate: gigDateLabel(project),
      lines,
      grandTotal,
      paymentsUrl: `${getAppUrl()}/dashboard/payments?project=${project.id}`,
      branding: branding(org),
    })
    await logEmail({
      organizationId: project.organization_id,
      recipientEmail: adminEmails[0],
      subject: result.subject,
      emailType: 'pay_summary',
      projectId: project.id,
      resendEmailId: result.id || null,
      metadata: { allRecipients: adminEmails, grandTotal, people: lines.length },
      body: result.emailHtml,
      status: result.suppressed ? 'suppressed' : 'sent',
    })
    return result.suppressed ? 'suppressed' : 'sent'
  } catch (err) {
    console.error(`After-gig: pay summary send failed for project ${project.id}:`, err)
    // Release the claim so the next run tries again (inside the lookback window).
    await supabase
      .from('projects')
      .update({ pay_summary_sent_at: null })
      .eq('id', project.id)
      .eq('pay_summary_sent_at', claimedAt)
    return 'failed'
  }
}

export interface ReportRequestOutcome {
  musicianId: string
  name: string
  outcome: 'sent' | 'suppressed' | 'already-asked' | 'no-email' | 'failed'
}

export async function requestGigReports(
  supabase: Supabase,
  project: any,
  { force = false }: { force?: boolean } = {},
): Promise<ReportRequestOutcome[]> {
  const leads = gigLeads(project.project_positions)
  const outcomes: ReportRequestOutcome[] = []
  const org = project.organization

  for (const lead of leads) {
    if (!lead.email) {
      outcomes.push({ musicianId: lead.musicianId, name: lead.name, outcome: 'no-email' })
      continue
    }

    const { data: existing } = await supabase
      .from('gig_reports')
      .select('id, token, submitted_at')
      .eq('project_id', project.id)
      .eq('musician_id', lead.musicianId)
      .maybeSingle()

    if (existing && (!force || existing.submitted_at)) {
      outcomes.push({ musicianId: lead.musicianId, name: lead.name, outcome: 'already-asked' })
      continue
    }

    let reportId: string
    let token: string
    let created = false
    if (existing) {
      reportId = existing.id
      token = existing.token
      await supabase.from('gig_reports').update({ requested_at: new Date().toISOString() }).eq('id', reportId)
    } else {
      token = randomBytes(32).toString('hex')
      const { data: inserted, error: insertError } = await supabase
        .from('gig_reports')
        .insert({
          organization_id: project.organization_id,
          project_id: project.id,
          musician_id: lead.musicianId,
          token,
        })
        .select('id')
        .single()
      if (insertError || !inserted) {
        // A unique violation means another run just created it: that run sends.
        const outcome = insertError?.code === '23505' ? 'already-asked' : 'failed'
        if (outcome === 'failed') console.error(`After-gig: could not create gig report for ${project.id}/${lead.musicianId}:`, insertError)
        outcomes.push({ musicianId: lead.musicianId, name: lead.name, outcome })
        continue
      }
      reportId = inserted.id
      created = true
    }

    try {
      const result = await sendGigReportRequestEmail({
        to: lead.email,
        leadFirstName: lead.firstName,
        organizationName: org?.name || 'Your organization',
        organizationId: project.organization_id,
        projectName: project.name,
        gigDate: gigDateLabel(project),
        reportUrl: `${getAppUrl()}/report/${token}`,
        branding: branding(org),
      })
      await logEmail({
        organizationId: project.organization_id,
        recipientEmail: lead.email,
        recipientName: lead.name,
        subject: result.subject,
        emailType: 'gig_report_request',
        musicianId: lead.musicianId,
        projectId: project.id,
        resendEmailId: result.id || null,
        metadata: { reportId, resend: !created },
        body: result.emailHtml,
        status: result.suppressed ? 'suppressed' : 'sent',
      })
      outcomes.push({ musicianId: lead.musicianId, name: lead.name, outcome: result.suppressed ? 'suppressed' : 'sent' })
    } catch (err) {
      console.error(`After-gig: report request send failed for ${project.id}/${lead.musicianId}:`, err)
      // A brand-new row whose email never left is removed so the next run asks again.
      if (created) await supabase.from('gig_reports').delete().eq('id', reportId).is('opened_at', null)
      outcomes.push({ musicianId: lead.musicianId, name: lead.name, outcome: 'failed' })
    }
  }

  return outcomes
}
