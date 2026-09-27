import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { resolveGigReportToken } from '@/lib/after-gig/report-token'
import { sendGigReportSubmittedEmail } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'
import { rateLimit } from '@/lib/rate-limit'

const text = z.string().trim().max(4000).optional().transform((v) => (v ? v : null))

const reportSchema = z.object({
  overall: z.enum(['great', 'good', 'issues']),
  allOnTime: z.boolean(),
  lateNotes: text,
  hiccups: text,
  clientFollowUp: text,
  arrangementNotes: text,
  otherNotes: text,
})

const NOT_FOUND = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  // Bounds a stuck retry loop on one link; the token is the real access control.
  const limit = rateLimit(`gig-report:${token}`, 10, 10 * 60 * 1000)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a few minutes.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    )
  }
  const report = await resolveGigReportToken(token)
  if (!report) return NOT_FOUND()

  const parsed = reportSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please answer the first two questions.' }, { status: 400 })
  }
  const a = parsed.data

  // Submitted once, then locked: the conditional update makes a double click or
  // a second tab a no-op instead of a second email.
  const supabase = createServiceClient()
  const now = new Date().toISOString()
  const { data: saved, error } = await supabase
    .from('gig_reports')
    .update({
      overall: a.overall,
      all_on_time: a.allOnTime,
      late_notes: a.allOnTime ? null : a.lateNotes,
      hiccups: a.hiccups,
      client_follow_up: a.clientFollowUp,
      arrangement_notes: a.arrangementNotes,
      other_notes: a.otherNotes,
      submitted_at: now,
      updated_at: now,
    })
    .eq('id', report.reportId)
    .is('submitted_at', null)
    .select('id')

  if (error) {
    console.error(`Gig report ${report.reportId}: save failed:`, error)
    return NextResponse.json({ error: 'Could not save your report. Please try again.' }, { status: 500 })
  }
  if (!saved || saved.length === 0) {
    return NextResponse.json({ error: 'Already sent', alreadySubmitted: true }, { status: 409 })
  }

  // Tell the owners and admins. Best-effort: the report is saved and shows on
  // the gig either way, so a mail failure must not fail the lead's submit.
  try {
    const adminEmails = await getOrgAdminEmails(report.organizationId)
    if (adminEmails.length > 0) {
      const first = report.services[0]
      const gigDate = first
        ? new Date(first.start_time).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            timeZone: report.timezone || DEFAULT_TIMEZONE,
          })
        : ''
      const result = await sendGigReportSubmittedEmail({
        adminEmails,
        organizationName: report.organizationName,
        leadName: report.leadName,
        projectName: report.projectName,
        gigDate,
        answers: {
          overall: a.overall,
          allOnTime: a.allOnTime,
          lateNotes: a.allOnTime ? null : a.lateNotes,
          hiccups: a.hiccups,
          clientFollowUp: a.clientFollowUp,
          arrangementNotes: a.arrangementNotes,
          otherNotes: a.otherNotes,
        },
        projectUrl: `${getAppUrl()}/dashboard/projects?expand=${report.projectId}`,
        branding: report.branding,
      })
      await logEmail({
        organizationId: report.organizationId,
        recipientEmail: adminEmails[0],
        subject: result.subject,
        emailType: 'gig_report_submitted',
        musicianId: report.musicianId,
        projectId: report.projectId,
        resendEmailId: result.id || null,
        metadata: { reportId: report.reportId, allRecipients: adminEmails },
        body: result.emailHtml,
        status: result.suppressed ? 'suppressed' : 'sent',
      })
    }
  } catch (err) {
    console.error(`Gig report ${report.reportId}: admin email failed:`, err)
  }

  return NextResponse.json({ success: true })
}
