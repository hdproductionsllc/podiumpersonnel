/**
 * Daily nudges for clients who have a live song planner link and haven't sent
 * their list in yet (082).
 *
 * Fires at T-30, T-14, T-3 and on the due date itself. Exact-day matching, not
 * "at or past": a missed run skips that one nudge rather than firing three at
 * once the next morning, which is how a helpful reminder becomes spam.
 *
 * Safety, same as every other job here: requireCronAuth fails CLOSED when
 * CRON_SECRET is unset, CRON_ENABLED=false no-ops the whole run, and every send
 * still passes the EMAIL_SAFE_MODE chokepoint.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSongPlannerEmail } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { getAppUrl } from '@/lib/utils'
import { cronDisabledResponse, notifyOps, requireCronAuth } from '@/lib/cron'
import { PLANNER_REMINDER_OFFSETS } from '@/lib/intake/planner'
import { plannerEmailsEnabled } from '@/lib/intake/planner-email'

/** Whole days from now until `due`, rounded up so "later today" is 0, not -1. */
function daysUntil(due: Date, now: Date): number {
  return Math.ceil((due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
}

function sameUtcDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request)
  if (unauthorized) return unauthorized

  const disabled = cronDisabledResponse('song-planner-reminders')
  if (disabled) return disabled

  // This is the only UNATTENDED sender in the feature — nobody clicks it. It
  // stops here, before the query, until planner mail is explicitly switched on.
  if (!plannerEmailsEnabled()) {
    console.log('[SONG PLANNER EMAILS OFF] song-planner-reminders skipped (set SONG_PLANNER_EMAILS=true to enable)')
    return NextResponse.json({ skipped: true, reason: 'SONG_PLANNER_EMAILS is not enabled' })
  }

  const supabase = createServiceClient()
  const now = new Date()
  const baseUrl = getAppUrl()

  // Live link, nothing submitted, a deadline to nudge toward. An intake with no
  // due date gets no reminders at all — better silent than inventing a deadline.
  const { data: intakes, error } = await supabase
    .from('intakes')
    .select(`
      id,
      organization_id,
      project_id,
      client_token,
      client_token_expires_at,
      client_due_at,
      client_last_reminder_at,
      project:projects(name, start_date, client_name, client_email, status),
      organization:organizations(name, intake_enabled, email_logo_url, email_brand_color, email_footer_text)
    `)
    .not('client_token', 'is', null)
    .is('client_submitted_at', null)
    .not('client_due_at', 'is', null)

  if (error) {
    // A missing column means 082 hasn't been applied — that is a deployment
    // state, not an outage. Log it and report zero rather than paging ops.
    console.error('song-planner-reminders: fetch failed', error)
    if (error.code === '42703') {
      return NextResponse.json({ skipped: true, reason: 'migration 082 not applied' })
    }
    await notifyOps('song-planner-reminders', error)
    return NextResponse.json({ error: 'Failed to load planners' }, { status: 500 })
  }

  let sent = 0
  let skipped = 0
  // Emails that went out but whose "last reminded" stamp failed to save — each
  // of these will nudge the client again tomorrow unless someone looks.
  let stampFailed = 0

  for (const intake of intakes ?? []) {
    const project = intake.project as unknown as {
      name: string
      start_date: string | null
      client_name: string | null
      client_email: string | null
      status: string | null
    } | null
    const organization = intake.organization as unknown as {
      name: string
      intake_enabled: boolean
      email_logo_url: string | null
      email_brand_color: string | null
      email_footer_text: string | null
    } | null

    if (!project || !organization) { skipped++; continue }
    // Every gate the client's own page applies, applied again here — a link that
    // would 404 must not generate an email inviting someone to open it.
    if (!organization.intake_enabled) { skipped++; continue }
    if (project.status === 'cancelled') { skipped++; continue }
    if (!project.client_email) { skipped++; continue }
    if (
      intake.client_token_expires_at &&
      new Date(intake.client_token_expires_at as string) < now
    ) { skipped++; continue }

    const due = new Date(intake.client_due_at as string)
    if (Number.isNaN(due.getTime())) { skipped++; continue }

    const remaining = daysUntil(due, now)
    if (!(PLANNER_REMINDER_OFFSETS as readonly number[]).includes(remaining)) { skipped++; continue }

    // Belt and braces against a double run on one day (a retry, a manual
    // trigger): one nudge per intake per day, whatever else happens.
    const lastAt = intake.client_last_reminder_at
      ? new Date(intake.client_last_reminder_at as string)
      : null
    if (lastAt && sameUtcDay(lastAt, now)) { skipped++; continue }

    try {
      const result = await sendSongPlannerEmail({
        to: project.client_email,
        clientName: project.client_name || 'there',
        organizationName: organization.name,
        organizationId: intake.organization_id as string,
        plannerUrl: `${baseUrl}/plan/${intake.client_token}`,
        eventDate: project.start_date,
        dueAt: intake.client_due_at as string,
        variant: remaining === 0 ? 'due' : 'reminder',
        branding: {
          logoUrl: organization.email_logo_url,
          brandColor: organization.email_brand_color,
          footerText: organization.email_footer_text,
        },
      })

      // Stamped only after the send returns, so a failure is retried tomorrow
      // rather than silently swallowed.
      const { error: stampError } = await supabase
        .from('intakes')
        .update({ client_last_reminder_at: now.toISOString() })
        .eq('id', intake.id)

      if (stampError) {
        // The email was sent; only the stamp is missing, so tomorrow's run will
        // send a duplicate. Counted separately so the summary shows it.
        console.error(`song-planner-reminders: sent to intake ${intake.id} but failed to stamp client_last_reminder_at (duplicate likely tomorrow)`, stampError)
        stampFailed++
      }

      await logEmail({
        organizationId: intake.organization_id as string,
        recipientEmail: project.client_email,
        recipientName: project.client_name || undefined,
        subject: `Music selections reminder — ${project.name}`,
        emailType: remaining === 0 ? 'song_planner_due' : 'song_planner_reminder',
        projectId: intake.project_id as string,
        resendEmailId: result?.id || null,
        metadata: { daysUntilDue: remaining },
      })

      sent++
    } catch (err) {
      console.error(`song-planner-reminders: send failed for intake ${intake.id}`, err)
      skipped++
    }
  }

  return NextResponse.json({ sent, skipped, stampFailed })
}
