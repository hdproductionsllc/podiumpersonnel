/**
 * POST /api/plan/[token]/request-changes — the escape hatch on a locked list (082).
 *
 * Once a client submits, their list locks. This is what the "Something needs
 * changing" button does: it emails the operator, who decides whether to reopen.
 * The client cannot unlock their own list — the operator's preparation may
 * already be under way, and a silent change under it is the failure this whole
 * feature exists to prevent.
 *
 * Owner's call (spec §12 Q4): this emails rather than telling them to phone.
 *
 * The message is the client's own words and reaches an HTML email, so it is
 * escaped, bounded, and never interpreted.
 */

import { NextResponse } from 'next/server'
import { getOrgAdminEmails } from '@/lib/supabase/server'
import { resolvePlannerToken } from '@/lib/intake/planner-token'
import { sendEmail } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { rateLimit } from '@/lib/rate-limit'
import { getAppUrl, escapeHtml } from '@/lib/utils'
import { PLANNER_MAX_NOTE_CHARS } from '@/lib/intake/planner'
import { plannerEmailsEnabled, plannerEmailSkipped } from '@/lib/intake/planner-email'

const PUBLIC_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
  'Referrer-Policy': 'no-referrer',
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...PUBLIC_HEADERS, ...extra } })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // Tight: this one sends mail to a human, so a stuck button must not become a
  // mailbox full of identical requests.
  const limited = rateLimit(`plan-changes:${token}`, 3, 60 * 60_000)
  if (!limited.allowed) {
    return json(
      { error: "We've passed that on already — we'll be in touch shortly." },
      429,
      { 'Retry-After': String(limited.retryAfter) }
    )
  }

  const ctx = await resolvePlannerToken(token)
  if (!ctx) return json({ error: 'This link is not valid.' }, 404)

  let body: { message?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    // A bare "please reopen this" with no note is a perfectly good request.
  }

  const message =
    typeof body.message === 'string' ? body.message.trim().slice(0, PLANNER_MAX_NOTE_CHARS) : ''

  // This endpoint exists only to send mail, so with sending off there is nothing
  // honest to do but tell the client to call. Never claim it was passed on.
  if (!plannerEmailsEnabled()) {
    plannerEmailSkipped('planner change request', 'organization admins')
    return json(
      { error: 'Please get in touch with us directly and we\'ll sort this out for you.' },
      503
    )
  }

  const adminEmails = await getOrgAdminEmails(ctx.organizationId)
  if (adminEmails.length === 0) {
    // Nobody to tell. Don't pretend it worked — the client needs to know to call.
    console.error(`plan/request-changes: org ${ctx.organizationId} has no admin email`)
    return json({ error: 'Please get in touch with us directly so we can help.' }, 500)
  }

  const who = ctx.project.clientName || 'A client'
  const subject = `Change requested — ${ctx.project.name}`

  const result = await sendEmail({
    to: adminEmails,
    subject,
    html:
      `<p><strong>${escapeHtml(who)}</strong> would like to change their music for ` +
      `<strong>${escapeHtml(ctx.project.name)}</strong>, which they have already sent in.</p>` +
      (message
        ? `<p><strong>What they said:</strong></p><blockquote>${escapeHtml(message)}</blockquote>`
        : '<p>They did not leave a note.</p>') +
      `<p>Reopening their list from the project's Client Selections panel makes the same ` +
      `link editable again.</p>` +
      `<p><a href="${getAppUrl()}/dashboard/projects">Open the project</a></p>`,
  })

  if (result?.id) {
    await logEmail({
      organizationId: ctx.organizationId,
      recipientEmail: adminEmails.join(', '),
      recipientName: 'Organization admins',
      subject,
      emailType: 'song_planner_change_request',
      projectId: ctx.projectId,
      resendEmailId: result.id,
      metadata: { hasMessage: message.length > 0 },
    })
  }

  return json({ ok: true })
}
