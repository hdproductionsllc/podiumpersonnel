/**
 * /api/intake/[projectId]/planner-link — the OPERATOR's half of the client song
 * planner (082). Everything here needs an authenticated, intake-enabled admin;
 * the client's half lives under /api/plan/[token] and has no session at all.
 *
 *   POST   → mint a link (or re-mint one), optionally emailing the client
 *   PATCH  → change the due date, or reopen a submitted list for editing
 *   DELETE → revoke: the link 404s from the next request onward
 *
 * Re-minting on every POST is deliberate: "resend" must invalidate the link that
 * was sent before, so a forwarded old email stops working. Same reasoning as
 * 078's W-9 request token.
 *
 * Security: the org comes from the caller's membership, never the request body,
 * and the project is verified to belong to that org before any read or write.
 */

import { randomBytes } from 'crypto'
import { requireIntakeEnabled, apiError, apiSuccess, serverError } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSongPlannerEmail } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { getAppUrl } from '@/lib/utils'
import { plannerDueAt, plannerLinkExpiry } from '@/lib/intake/planner'
import { plannerEmailsEnabled, plannerEmailSkipped } from '@/lib/intake/planner-email'

type SupabaseError = { code?: string; message?: string } | null

/** 082 not applied yet — say so plainly instead of leaking a Postgres error. */
function isMissingPlannerColumn(err: SupabaseError): boolean {
  if (!err) return false
  const code = err.code ?? ''
  if (code === '42703' || code === 'PGRST204' || code === 'PGRST205') return true
  const msg = (err.message ?? '').toLowerCase()
  return msg.includes('client_token') || (msg.includes('schema cache') && msg.includes('client_'))
}

const NOT_READY = 'Song planner columns not ready — run migration 082'

interface ProjectRow {
  id: string
  name: string
  start_date: string | null
  event_type: string | null
  client_name: string | null
  client_email: string | null
  organization_id: string
}

/** Load the project and prove it belongs to the caller's org. Never trust the path. */
async function loadProject(
  service: ReturnType<typeof createServiceClient>,
  projectId: string,
  orgId: string
): Promise<{ ok: true; project: ProjectRow } | { ok: false; response: Response }> {
  const { data, error } = await service
    .from('projects')
    .select('id, name, start_date, event_type, client_name, client_email, organization_id')
    .eq('id', projectId)
    .maybeSingle()

  if (error) return { ok: false, response: serverError('planner-link: load project', error) }
  // Same 404 whether it's missing or another org's — never confirm the existence
  // of a resource outside the caller's tenant.
  if (!data || data.organization_id !== orgId) {
    return { ok: false, response: apiError('Project not found', 404) }
  }
  return { ok: true, project: data as ProjectRow }
}

/**
 * The intake row for this project, created empty if the operator is starting
 * from the planner rather than from a pasted questionnaire. Marked
 * source='client-form' (069 already allows it) so its origin is obvious later.
 *
 * An existing intake is returned untouched — creating a link must never disturb
 * a questionnaire that has already been parsed and reviewed.
 */
async function ensureIntake(
  service: ReturnType<typeof createServiceClient>,
  projectId: string,
  orgId: string
): Promise<{ ok: true; id: string } | { ok: false; response: Response }> {
  const { data: existing, error: readErr } = await service
    .from('intakes')
    .select('id')
    .eq('project_id', projectId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (readErr) return { ok: false, response: serverError('planner-link: load intake', readErr) }
  if (existing) return { ok: true, id: existing.id as string }

  const { data: created, error: insErr } = await service
    .from('intakes')
    .insert({
      organization_id: orgId,
      project_id: projectId,
      source: 'client-form',
      status: 'draft',
    })
    .select('id')
    .single()

  if (insErr) return { ok: false, response: serverError('planner-link: create intake', insErr) }
  return { ok: true, id: created!.id as string }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const { membership, error } = await requireIntakeEnabled()
  if (error || !membership) return error ?? apiError('Not found', 404)
  const orgId = membership.organization_id

  let body: { send?: unknown; dueAt?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    // An empty body is fine: "create the link, don't email it yet."
  }

  const service = createServiceClient()

  const loaded = await loadProject(service, projectId, orgId)
  if (!loaded.ok) return loaded.response
  const project = loaded.project

  const intake = await ensureIntake(service, projectId, orgId)
  if (!intake.ok) return intake.response

  // The switch is checked BEFORE the "no client email" complaint: with sending
  // off, a missing address is not a problem the operator needs to hear about.
  const sendingEnabled = plannerEmailsEnabled()
  const shouldSend = body.send === true && sendingEnabled
  if (body.send === true && sendingEnabled && !project.client_email) {
    return apiError('This project has no client email — add one, or copy the link and send it yourself.', 400)
  }

  // A fresh 256-bit token every time, so yesterday's email stops working.
  const token = randomBytes(32).toString('hex')
  const expiresAt = plannerLinkExpiry()
  const dueAt =
    typeof body.dueAt === 'string' && body.dueAt.trim() !== ''
      ? new Date(body.dueAt).toISOString()
      : plannerDueAt(project.start_date)

  const { error: mintErr } = await service
    .from('intakes')
    .update({
      client_token: token,
      client_token_expires_at: expiresAt,
      client_due_at: dueAt,
      client_link_sent_at: shouldSend ? new Date().toISOString() : null,
      // A new link is a new invitation: the reminder clock restarts, and a list
      // that was submitted under the old link stays submitted until the operator
      // explicitly reopens it (PATCH), which is the visible, deliberate action.
      client_last_reminder_at: null,
    })
    .eq('id', intake.id)
    .eq('organization_id', orgId)

  if (mintErr) {
    if (isMissingPlannerColumn(mintErr)) return apiError(NOT_READY, 503)
    return serverError('planner-link: mint token', mintErr)
  }

  const url = `${getAppUrl()}/plan/${token}`

  if (body.send === true && !sendingEnabled) {
    // The link is real and usable — only the send is withheld. Say so plainly
    // rather than reporting a success that never left the building.
    plannerEmailSkipped('planner invite', project.client_email ?? '(no client email)')
    return apiSuccess({ url, dueAt, expiresAt, sent: false, sendingDisabled: true })
  }

  if (shouldSend) {
    const { data: org } = await service
      .from('organizations')
      .select('name, email_logo_url, email_brand_color, email_footer_text')
      .eq('id', orgId)
      .maybeSingle()

    try {
      const result = await sendSongPlannerEmail({
        to: project.client_email!,
        clientName: project.client_name || 'there',
        organizationName: org?.name || 'your musicians',
        organizationId: orgId,
        plannerUrl: url,
        eventDate: project.start_date,
        dueAt,
        variant: 'invite',
        branding: {
          logoUrl: org?.email_logo_url,
          brandColor: org?.email_brand_color,
          footerText: org?.email_footer_text,
        },
      })

      await logEmail({
        organizationId: orgId,
        recipientEmail: project.client_email!,
        recipientName: project.client_name || undefined,
        subject: `Your music selections for ${project.name}`,
        emailType: 'song_planner_invite',
        projectId,
        resendEmailId: result?.id || null,
        body: result?.emailHtml,
      })
    } catch (err) {
      // The token is already live. Say the send failed and hand back the link so
      // the operator can paste it into their own email — losing the link here
      // would be the worse failure.
      console.error('planner-link: send failed', err)
      return apiSuccess({ url, dueAt, expiresAt, sent: false, sendError: true }, 200)
    }
  }

  return apiSuccess({ url, dueAt, expiresAt, sent: shouldSend })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const { membership, error } = await requireIntakeEnabled()
  if (error || !membership) return error ?? apiError('Not found', 404)
  const orgId = membership.organization_id

  let body: { reopen?: unknown; dueAt?: unknown }
  try {
    body = await request.json()
  } catch {
    return apiError('Invalid JSON body', 400)
  }

  const service = createServiceClient()
  const loaded = await loadProject(service, projectId, orgId)
  if (!loaded.ok) return loaded.response

  const update: Record<string, unknown> = {}
  if (body.reopen === true) {
    // Hand the list back to the client. Their token is untouched — the same link
    // simply becomes editable again.
    update.client_submitted_at = null
  }
  if (typeof body.dueAt === 'string' && body.dueAt.trim() !== '') {
    update.client_due_at = new Date(body.dueAt).toISOString()
    // A new deadline earns a fresh set of nudges.
    update.client_last_reminder_at = null
  } else if (body.dueAt === null) {
    update.client_due_at = null
  }

  if (Object.keys(update).length === 0) {
    return apiError('Nothing to update.', 400)
  }

  const { error: updErr } = await service
    .from('intakes')
    .update(update)
    .eq('project_id', projectId)
    .eq('organization_id', orgId)

  if (updErr) {
    if (isMissingPlannerColumn(updErr)) return apiError(NOT_READY, 503)
    return serverError('planner-link: update', updErr)
  }

  return apiSuccess({ ok: true })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const { membership, error } = await requireIntakeEnabled()
  if (error || !membership) return error ?? apiError('Not found', 404)
  const orgId = membership.organization_id

  const service = createServiceClient()
  const loaded = await loadProject(service, projectId, orgId)
  if (!loaded.ok) return loaded.response

  // Revoke = clear the token. The songs the client already entered stay exactly
  // where they are; only their way back in is removed.
  const { error: revokeErr } = await service
    .from('intakes')
    .update({
      client_token: null,
      client_token_expires_at: null,
      client_link_sent_at: null,
      client_last_reminder_at: null,
    })
    .eq('project_id', projectId)
    .eq('organization_id', orgId)

  if (revokeErr) {
    if (isMissingPlannerColumn(revokeErr)) return apiError(NOT_READY, 503)
    return serverError('planner-link: revoke', revokeErr)
  }

  return apiSuccess({ ok: true })
}
