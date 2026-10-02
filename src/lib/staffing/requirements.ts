/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST embeds */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { isMissingColumn, isMissingFunction } from './rpc'
import {
  MAX_REQUIREMENT_QUANTITY,
  type CallScopeView,
  type ChairCallScope,
  type RequirementInput,
  type RequirementRow,
} from './requirement-rules'

export * from './requirement-rules'

/**
 * Requirements ("Stagehand x 8, load-in only, $200 each") and the call picker
 * on one chair: migration 099, target architecture 3.5.
 *
 * A requirement is the line an admin writes; the database turns it into
 * `quantity` ordinary chairs at once (create_requirement), each limited to the
 * same calls (098's position_services). From then on a chair is a chair:
 * offers, auto-offer, pay, the gig page and conflicts read it through
 * servicesFor like any other, so nothing downstream knows about requirements
 * except the two places that summarise a gig (the projects page and the
 * staffing alert), which group its chairs back into their line.
 *
 * All of it is behind organizations.call_scoped_requirements (098): both
 * database functions refuse an organization with the switch off, and the
 * projects page shows none of it there. Every organization has it off today.
 *
 * Pay: requirements.default_pay is the amount for the WHOLE engagement, per
 * chair, like an offer's custom_pay (owed once, not per call). It is what the
 * Send Offer dialog suggests for one of its chairs; the offer's amount is
 * what is agreed and paid (payments/compute.ts). There is no pay basis.
 *
 * Fulfilment is derived from the chairs, never counted separately: a
 * requirement is filled when as many of its chairs are confirmed as it asked
 * for (requirementFulfilment here; 099's trigger keeps requirements.status in
 * step the same way).
 */

export const MIGRATION_099_MISSING =
  'migration 099 (scripts/sql/099-requirements.paste.sql) has not been applied'

// ---------------------------------------------------------------------------
// The two database functions
// ---------------------------------------------------------------------------

export type RequirementRefusal =
  | 'not_found'
  | 'forbidden'
  | 'not_enabled'
  | 'gig_closed'
  | 'invalid'
  | 'no_services'
  | 'wrong_service'
  | 'request_key_reused'
  | 'chair_in_use'
  | 'not_ready'
  | 'failed'

export type CreateRequirementResult =
  | { ok: true; created: boolean; requirement: RequirementRow; positionIds: string[] }
  | { ok: false; status: number; code: RequirementRefusal; error: string }

export type SetChairScopeResult =
  | { ok: true; changed: boolean }
  | { ok: false; status: number; code: RequirementRefusal; error: string }

type Refused = { ok: false; status: number; code: RequirementRefusal; error: string }
const refuse = (status: number, code: RequirementRefusal, error: string): Refused => ({ ok: false, status, code, error })

const NOT_READY = 'This needs a database update first. Nothing was changed.'

/** A refusal either function can return, as the admin is told it. */
function commonRefusal(result: string | undefined, what?: string): Refused | null {
  switch (result) {
    case 'not_found':
      if (what === 'instrument') return refuse(404, 'not_found', 'That role is not in your organization')
      return refuse(404, 'not_found', 'Not found')
    case 'forbidden':
      return refuse(403, 'forbidden', 'Permission denied')
    case 'not_enabled':
      return refuse(409, 'not_enabled', 'Your organization does not limit chairs to some calls.')
    case 'no_services':
      return refuse(400, 'no_services', 'Choose at least one call, or every call.')
    case 'wrong_service':
      return refuse(400, 'wrong_service', 'One of the chosen calls is not part of this gig. Refresh and try again.')
    default:
      return null
  }
}

/**
 * Make a requirement and its chairs (create_requirement, 099), as `userId`.
 * The function checks that they are an admin of the gig's organization, that
 * the organization's switch is on and everything else; this maps its answer.
 * A retry with the same requestId returns the first result (created: false).
 */
export async function createRequirement(
  userId: string,
  projectId: string,
  input: RequirementInput
): Promise<CreateRequirementResult> {
  const service = createServiceClient()
  const { data, error } = await service.rpc('create_requirement', {
    p_project_id: projectId,
    p_instrument_id: input.instrumentId,
    p_quantity: input.quantity,
    p_created_by: userId,
    p_service_ids: input.serviceIds,
    p_default_pay: input.defaultPay,
    p_notes: input.notes,
    p_request_key: input.requestId,
  })

  if (error) {
    if (isMissingFunction(error, 'create_requirement')) {
      console.error(`createRequirement: refused for project ${projectId}: ${MIGRATION_099_MISSING}`)
      return refuse(503, 'not_ready', NOT_READY)
    }
    console.error(`createRequirement: create_requirement failed for project ${projectId}:`, error)
    return refuse(500, 'failed', 'Could not add these chairs')
  }

  const r = data as { result?: string; what?: string; requirement?: RequirementRow; position_ids?: string[] } | null
  if (r?.result === 'created' || r?.result === 'existing') {
    return { ok: true, created: r.result === 'created', requirement: r.requirement!, positionIds: r.position_ids || [] }
  }
  const common = commonRefusal(r?.result, r?.what)
  if (common) return common
  switch (r?.result) {
    case 'gig_closed':
      return refuse(409, 'gig_closed', 'This gig is cancelled or completed.')
    case 'invalid_quantity':
      return refuse(400, 'invalid', `How many must be a whole number from 1 to ${MAX_REQUIREMENT_QUANTITY}.`)
    case 'invalid_pay':
      return refuse(400, 'invalid', 'Invalid pay amount')
    case 'request_key_reused':
      return refuse(409, 'request_key_reused', 'This request was already used for another gig. Close the dialog and try again.')
    default:
      console.error('createRequirement: create_requirement returned an unexpected result:', r)
      return refuse(500, 'failed', 'Could not add these chairs')
  }
}

/**
 * Set which calls one chair works (set_position_scope, 099), as `userId`:
 * null for every call, or exactly the listed ones. Refused while someone is
 * seated in the chair or holds an open or accepted offer for it.
 */
export async function setChairScope(
  userId: string,
  positionId: string,
  serviceIds: string[] | null
): Promise<SetChairScopeResult> {
  const service = createServiceClient()
  const { data, error } = await service.rpc('set_position_scope', {
    p_position_id: positionId,
    p_updated_by: userId,
    p_service_ids: serviceIds,
  })

  if (error) {
    if (isMissingFunction(error, 'set_position_scope')) {
      console.error(`setChairScope: refused for chair ${positionId}: ${MIGRATION_099_MISSING}`)
      return refuse(503, 'not_ready', NOT_READY)
    }
    console.error(`setChairScope: set_position_scope failed for chair ${positionId}:`, error)
    return refuse(500, 'failed', 'Could not update this chair')
  }

  const r = data as { result?: string } | null
  if (r?.result === 'updated' || r?.result === 'unchanged') return { ok: true, changed: r.result === 'updated' }
  const common = commonRefusal(r?.result)
  if (common) return common
  if (r?.result === 'chair_in_use') {
    return refuse(
      409,
      'chair_in_use',
      'Someone holds or is considering this chair, and their offer named its calls. Withdraw the offer or unassign them first.'
    )
  }
  console.error('setChairScope: set_position_scope returned an unexpected result:', r)
  return refuse(500, 'failed', 'Could not update this chair')
}

// ---------------------------------------------------------------------------
// The projects page: what it shows only where the switch is on
// ---------------------------------------------------------------------------

let reportedMissing099 = false

/**
 * What the projects page needs to show call pickers and requirements, or null
 * when it must show none of it: the organization's switch is off (every
 * organization today), or cannot be read (098 not applied), or the chairs and
 * requirements cannot be read (099 not applied). Read separately from the
 * page's main query so that query, and so the page of every organization with
 * the switch off, is exactly what it was.
 */
export async function getCallScopeView(supabase: SupabaseClient, organizationId: string): Promise<CallScopeView | null> {
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('call_scoped_requirements')
    .eq('id', organizationId)
    .maybeSingle()
  if (orgError) {
    if (!isMissingColumn(orgError)) console.error(`call scope for org ${organizationId} unavailable:`, orgError)
    return null
  }
  if ((org as any)?.call_scoped_requirements !== true) return null

  const [chairsRes, requirementsRes] = await Promise.all([
    supabase
      .from('project_positions')
      .select('id, scope_mode, requirement_id, position_services(service_id), project:projects!inner(organization_id)')
      .eq('project.organization_id', organizationId),
    supabase
      .from('requirements')
      .select('id, project_id, instrument_id, quantity, default_pay, notes, status, created_at, project:projects!inner(organization_id)')
      .eq('project.organization_id', organizationId)
      .order('created_at', { ascending: true }),
  ])
  const failed = chairsRes.error || requirementsRes.error
  if (failed) {
    if (!reportedMissing099) {
      reportedMissing099 = true
      console.warn(`call scope for org ${organizationId} unavailable (${MIGRATION_099_MISSING}?):`, failed)
    }
    return null
  }

  const chairs: Record<string, ChairCallScope> = {}
  for (const row of (chairsRes.data || []) as any[]) {
    const selected = row.scope_mode === 'selected'
    chairs[row.id] = {
      scopeMode: selected ? 'selected' : 'all',
      serviceIds: selected ? ((row.position_services || []) as { service_id: string }[]).map((ps) => ps.service_id) : [],
      requirementId: row.requirement_id ?? null,
    }
  }
  const requirements = ((requirementsRes.data || []) as any[]).map(
    (r): RequirementRow => ({
      id: r.id,
      project_id: r.project_id,
      instrument_id: r.instrument_id,
      quantity: r.quantity,
      default_pay: r.default_pay == null ? null : Number(r.default_pay),
      notes: r.notes ?? null,
      status: r.status,
    })
  )
  return { chairs, requirements }
}

// ---------------------------------------------------------------------------
// The staffing alert: chairs of one requirement are one line
// ---------------------------------------------------------------------------

/**
 * The requirement of each chair of a gig that has one, keyed by chair id.
 * Empty when the gig has none (every gig today) or when 099 is not applied:
 * the alert then lists chairs exactly as before. Never throws.
 */
export async function requirementsByChair(
  supabase: SupabaseClient,
  projectId: string
): Promise<Map<string, { id: string; quantity: number }>> {
  const out = new Map<string, { id: string; quantity: number }>()
  try {
    const { data, error } = await supabase
      .from('requirements')
      .select('id, quantity, project_positions(id)')
      .eq('project_id', projectId)
    if (error) {
      if (!reportedMissing099) {
        reportedMissing099 = true
        console.warn(`requirements for project ${projectId} unavailable (${MIGRATION_099_MISSING}?):`, error)
      }
      return out
    }
    for (const r of (data || []) as any[]) {
      for (const p of (r.project_positions || []) as { id: string }[]) out.set(p.id, { id: r.id, quantity: r.quantity })
    }
  } catch (err) {
    console.error(`requirements for project ${projectId} unavailable:`, err)
  }
  return out
}
