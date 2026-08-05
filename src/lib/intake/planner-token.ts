/**
 * Resolve a client song planner token (082) into the one intake it opens.
 *
 * The token IS the credential — there is no session on any /plan route — so this
 * function is the whole authorization step, and everything downstream takes its
 * org id, intake id and project from what this returns, never from the request.
 *
 * Four ways to fail, ONE outcome: unknown token, expired token, revoked token,
 * cancelled project all return null, and every caller turns null into a plain
 * 404. A "this link expired" page would confirm that the token was once real,
 * which is exactly the distinction a guesser wants (spec §9.7, criterion 8).
 *
 * Runs on the service client: there is no session to scope with, and no anon RLS
 * policy exists on intakes — by design (see 082's RLS note).
 */

import { createServiceClient } from '@/lib/supabase/server'
import type { IntakeSection } from './types'
import { sectionsForEventType, showsProcessionalOrder } from './planner'

export interface PlannerContext {
  intakeId: string
  organizationId: string
  projectId: string
  /** Set = the client's list is locked; only the operator can reopen it. */
  submittedAt: string | null
  openedAt: string | null
  dueAt: string | null
  processionalOrder: string[]
  project: {
    name: string
    startDate: string | null
    eventType: string | null
    clientName: string | null
  }
  organizationName: string
  /** Which lanes this booking gets. Driven by the event type, never by the client. */
  sections: IntakeSection[]
  showProcessional: boolean
}

/**
 * @returns the context, or null — and null must always become a 404, never a
 *          message that distinguishes the failures.
 */
export async function resolvePlannerToken(
  token: string,
  now = new Date()
): Promise<PlannerContext | null> {
  // Cheap shape check before touching the database: our tokens are 64 hex chars
  // (randomBytes(32).toString('hex')). Anything else cannot be one of ours.
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null

  const service = createServiceClient()

  const { data, error } = await service
    .from('intakes')
    .select(`
      id,
      organization_id,
      project_id,
      client_token_expires_at,
      client_submitted_at,
      client_opened_at,
      client_due_at,
      processional_order,
      project:projects(name, start_date, event_type, client_name, status),
      organization:organizations(name, intake_enabled)
    `)
    .eq('client_token', token)
    .maybeSingle()

  if (error || !data) return null

  if (data.client_token_expires_at && new Date(data.client_token_expires_at) < now) return null

  const project = data.project as unknown as {
    name: string
    start_date: string | null
    event_type: string | null
    client_name: string | null
    status: string | null
  } | null
  const organization = data.organization as unknown as {
    name: string
    intake_enabled: boolean
  } | null

  if (!project || !organization) return null

  // A cancelled booking has no music to plan. Same 404 — the client already knows
  // it's cancelled; the page has nothing useful to say.
  if (project.status === 'cancelled') return null

  // The feature is flag-gated per org and fails CLOSED, exactly like the
  // operator-side routes: turning the flag off must take the client pages down
  // with it, not leave live links behind.
  if (!organization.intake_enabled) return null

  const sections = sectionsForEventType(project.event_type)

  return {
    intakeId: data.id as string,
    organizationId: data.organization_id as string,
    projectId: data.project_id as string,
    submittedAt: (data.client_submitted_at as string | null) ?? null,
    openedAt: (data.client_opened_at as string | null) ?? null,
    dueAt: (data.client_due_at as string | null) ?? null,
    processionalOrder: Array.isArray(data.processional_order)
      ? (data.processional_order as string[])
      : [],
    project: {
      name: project.name,
      startDate: project.start_date,
      eventType: project.event_type,
      clientName: project.client_name,
    },
    organizationName: organization.name,
    sections,
    showProcessional: showsProcessionalOrder(sections),
  }
}
