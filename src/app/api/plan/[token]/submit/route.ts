/**
 * POST /api/plan/[token]/submit — the client says "this is our list" (082).
 *
 * Locks the list to the client (client_submitted_at) and tells the operator it
 * arrived. Idempotent: a double-tap on a phone, or a retry after a flaky
 * connection, must not be an error and must not send a second notification.
 *
 * Locking is NOT confirming. intakes.status stays 'draft' — the operator's
 * review and confirm gate is untouched by anything the client does.
 */

import { NextResponse } from 'next/server'
import { createServiceClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { resolvePlannerToken } from '@/lib/intake/planner-token'
import { sendEmail } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { rateLimit } from '@/lib/rate-limit'
import { plannerEmailsEnabled, plannerEmailSkipped } from '@/lib/intake/planner-email'
import { getAppUrl, escapeHtml } from '@/lib/utils'

const PUBLIC_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
  'Referrer-Policy': 'no-referrer',
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...PUBLIC_HEADERS, ...extra } })
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const limited = rateLimit(`plan-submit:${token}`, 10, 60_000)
  if (!limited.allowed) {
    return json({ error: 'Please wait a moment and try again.' }, 429, {
      'Retry-After': String(limited.retryAfter),
    })
  }

  const ctx = await resolvePlannerToken(token)
  if (!ctx) return json({ error: 'This link is not valid.' }, 404)

  // Already in. Report success and send nothing — the operator was told once.
  if (ctx.submittedAt) {
    return json({ ok: true, submittedAt: ctx.submittedAt, alreadySubmitted: true })
  }

  const service = createServiceClient()
  const submittedAt = new Date().toISOString()

  const { error } = await service
    .from('intakes')
    .update({ client_submitted_at: submittedAt })
    .eq('id', ctx.intakeId)
    .eq('organization_id', ctx.organizationId)
    // Only the first writer wins, so two requests racing on a double-tap can
    // never both go on to email the operator.
    .is('client_submitted_at', null)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('plan/submit: lock list', error)
    return json({ error: 'We could not send that just now. Please try again.' }, 500)
  }

  // Best-effort — the client's list is safely in either way.
  notifyOperator(service, ctx).catch((err) =>
    console.warn('plan/submit: operator notification failed', err)
  )

  return json({ ok: true, submittedAt })
}

async function notifyOperator(
  service: ReturnType<typeof createServiceClient>,
  ctx: Awaited<ReturnType<typeof resolvePlannerToken>>
): Promise<void> {
  if (!ctx) return

  const adminEmails = await getOrgAdminEmails(ctx.organizationId)
  if (adminEmails.length === 0) return

  // The switch covers this too. The client's list is safely locked in either
  // way; with sending off the operator finds it on the project as usual.
  if (!plannerEmailsEnabled()) {
    plannerEmailSkipped('planner submitted notification', adminEmails.join(', '))
    return
  }

  const { count } = await service
    .from('intake_songs')
    .select('id', { count: 'exact', head: true })
    .eq('intake_id', ctx.intakeId)
    .eq('organization_id', ctx.organizationId)

  const who = ctx.project.clientName || 'Your client'
  const subject = `Music selections received — ${ctx.project.name}`
  const reviewUrl = `${getAppUrl()}/dashboard/projects`

  const result = await sendEmail({
    to: adminEmails,
    subject,
    html:
      `<p><strong>${escapeHtml(who)}</strong> has sent in their music for ` +
      `<strong>${escapeHtml(ctx.project.name)}</strong>.</p>` +
      `<p>${count ?? 0} song${count === 1 ? '' : 's'}, already matched against your library ` +
      `where we could. Their list is locked until you reopen it.</p>` +
      `<p><a href="${reviewUrl}">Review the selections</a></p>`,
  })

  if (result?.id) {
    await logEmail({
      organizationId: ctx.organizationId,
      recipientEmail: adminEmails.join(', '),
      recipientName: 'Organization admins',
      subject,
      emailType: 'song_planner_submitted',
      projectId: ctx.projectId,
      resendEmailId: result.id,
    })
  }
}
