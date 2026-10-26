import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { resolveGigReportToken } from '@/lib/after-gig/report-token'
import { sendGigReportSubmittedEmail } from '@/lib/email/send'
import { notify } from '@/lib/notify'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'
import { rateLimit } from '@/lib/rate-limit'

const text = z.string().trim().max(4000).optional().transform((v) => (v ? v : null))

const reportSchema = z.object({
  overall: z.enum(['great', 'good', 'issues']),
  allOnTime: z.boolean(),
  detailsAccuracy: z.enum(['matched', 'minor', 'significant']).nullable().optional().transform(v => v ?? null),
  clientFeedback: z.enum(['positive', 'concern', 'none']).nullable().optional().transform(v => v ?? null),
  lateNotes: text,
  hiccups: text,
  clientFollowUp: text,
  arrangementNotes: text,
  otherNotes: text,
  // Added 2026-10-04 (migration 101). Optional on the server so a report form
  // left open from before the questions existed still submits; the form
  // newer forms use the optional clientFeedback question instead.
  clientInteracted: z.boolean().nullable().optional().transform((v) => v ?? null),
  clientExperience: z.enum(['positive', 'neutral', 'negative']).nullable().optional().transform((v) => v ?? null),
})

const NOT_FOUND = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const isForm = ['application/x-www-form-urlencoded', 'multipart/form-data'].some(type => (request.headers.get('content-type') || '').toLowerCase().startsWith(type))
  const reply = (data: Record<string, unknown>, status = 200) => {
    if (!isForm) return NextResponse.json(data, { status })
    const page = new URL('/report/' + encodeURIComponent(token), request.url)
    if (status >= 400 && !data.alreadySubmitted) page.searchParams.set('error', '1')
    return NextResponse.redirect(page, 303)
  }
  // Bounds a stuck retry loop on one link; the token is the real access control.
  const limit = rateLimit(`gig-report:${token}`, 10, 10 * 60 * 1000)
  if (!limit.allowed) {
    if (isForm) return reply({ error: 'Too many attempts.' }, 429)
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a few minutes.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    )
  }
  const report = await resolveGigReportToken(token)
  if (!report) return NOT_FOUND()

  let body: unknown
  if (isForm) {
    const form = await request.formData().catch(() => null)
    body = form ? Object.fromEntries(form.entries()) : null
    if (body && typeof body === 'object') {
      const values = body as Record<string, unknown>
      values.allOnTime = values.allOnTime === 'true' ? true : values.allOnTime === 'false' ? false : undefined
      if (!values.clientFeedback) delete values.clientFeedback
    }
  } else body = await request.json().catch(() => null)
  const parsed = reportSchema.safeParse(body)
  if (!parsed.success) {
    return reply({ error: 'Please answer overall and punctuality, and choose valid gig details.' }, 400)
  }
  const a = parsed.data
  // How it went with the client is only meaningful after "yes, I dealt with them".
  const clientExperience = a.clientInteracted ? a.clientExperience : null

  // Submitted once, then locked: the conditional update makes a double click or
  // a second tab a no-op instead of a second email.
  const supabase = createServiceClient()
  const now = new Date().toISOString()
  const { data: saved, error } = await supabase
    .from('gig_reports')
    .update({
      details_accuracy: a.detailsAccuracy,
      client_feedback: a.clientFeedback,
      overall: a.overall,
      all_on_time: a.allOnTime,
      late_notes: a.allOnTime ? null : a.lateNotes,
      hiccups: a.hiccups,
      client_follow_up: a.clientFollowUp,
      client_interacted: a.clientInteracted,
      client_experience: clientExperience,
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
    return reply({ error: 'Could not save your report. Please try again.' }, 500)
  }
  if (!saved || saved.length === 0) {
    return reply({ error: 'Already sent', alreadySubmitted: true }, 409)
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
      await notify(
        {
          type: 'gig_report_submitted',
          record: (r) => ({
            organizationId: report.organizationId,
            recipientEmail: adminEmails[0],
            subject: r?.subject || `Gig report for ${report.projectName}`,
            emailType: 'gig_report_submitted',
            musicianId: report.musicianId,
            projectId: report.projectId,
            resendEmailId: r?.id || null,
            metadata: { reportId: report.reportId, allRecipients: adminEmails },
            body: r?.emailHtml,
            status: r?.suppressed ? 'suppressed' : 'sent',
          }),
        },
        {
          email: () =>
            sendGigReportSubmittedEmail({
              adminEmails,
              organizationName: report.organizationName,
              leadName: report.leadName,
              projectName: report.projectName,
              gigDate,
              answers: {
                detailsAccuracy: a.detailsAccuracy,
                clientFeedback: a.clientFeedback,
                overall: a.overall,
                allOnTime: a.allOnTime,
                lateNotes: a.allOnTime ? null : a.lateNotes,
                hiccups: a.hiccups,
                clientFollowUp: a.clientFollowUp,
                clientInteracted: a.clientInteracted,
                clientExperience,
                arrangementNotes: a.arrangementNotes,
                otherNotes: a.otherNotes,
              },
              projectUrl: `${getAppUrl()}/dashboard/projects?expand=${report.projectId}`,
              branding: report.branding,
            }),
        }
      )
    }
  } catch (err) {
    console.error(`Gig report ${report.reportId}: admin email failed:`, err)
  }

  return reply({ success: true })
}
