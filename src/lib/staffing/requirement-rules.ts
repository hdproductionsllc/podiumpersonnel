import { servicesFor, type PositionScope } from './scope'

/**
 * The rules about requirements that need no database: what a request may
 * contain, when a requirement is filled, and how its chairs are grouped back
 * into one line. Safe to import from the browser (the projects page uses
 * them); the database calls are in requirements.ts. See requirements.ts for
 * what a requirement is.
 */

/** The most chairs one requirement can make (create_requirement refuses more). */
export const MAX_REQUIREMENT_QUANTITY = 100

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface RequirementInput {
  instrumentId: string
  quantity: number
  /** null: every call of the gig. A list: only those calls (never empty). */
  serviceIds: string[] | null
  /** Whole-engagement amount per chair, or null. */
  defaultPay: number | null
  notes: string | null
  /** The dialog's id for this request: a retry with it makes nothing new. */
  requestId: string
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

/** A call list from a request: null for "every call", else unique ids (may be empty: refused later). */
function parseServiceIds(raw: unknown): ParseResult<string[] | null> {
  if (raw === null || raw === undefined) return { ok: true, value: null }
  if (!Array.isArray(raw) || raw.some((id) => typeof id !== 'string' || !UUID.test(id))) {
    return { ok: false, error: 'serviceIds must be null (every call) or a list of call ids' }
  }
  return { ok: true, value: [...new Set(raw as string[])] }
}

/** Reads POST /api/projects/[projectId]/requirements. */
export function parseRequirementInput(body: unknown): ParseResult<RequirementInput> {
  const b = (body ?? {}) as Record<string, unknown>
  if (typeof b.instrumentId !== 'string' || !UUID.test(b.instrumentId)) return { ok: false, error: 'instrumentId is required' }
  if (typeof b.requestId !== 'string' || !UUID.test(b.requestId)) return { ok: false, error: 'requestId is required' }
  const quantity = typeof b.quantity === 'number' ? b.quantity : Number(b.quantity)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_REQUIREMENT_QUANTITY) {
    return { ok: false, error: `quantity must be a whole number from 1 to ${MAX_REQUIREMENT_QUANTITY}` }
  }
  let defaultPay: number | null = null
  if (b.defaultPay !== null && b.defaultPay !== undefined && b.defaultPay !== '') {
    defaultPay = Number(b.defaultPay)
    if (!Number.isFinite(defaultPay) || defaultPay < 0) return { ok: false, error: 'Invalid pay amount' }
  }
  const services = parseServiceIds(b.serviceIds)
  if (!services.ok) return services
  const notes = typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim().slice(0, 1000) : null
  return {
    ok: true,
    value: { instrumentId: b.instrumentId, quantity, serviceIds: services.value, defaultPay, notes, requestId: b.requestId },
  }
}

/** Reads PUT /api/positions/[positionId]/scope: { serviceIds: null | string[] }. */
export function parseChairScopeInput(body: unknown): ParseResult<string[] | null> {
  const b = body as Record<string, unknown> | null
  if (!b || !('serviceIds' in b)) return { ok: false, error: 'serviceIds is required (null for every call)' }
  return parseServiceIds(b.serviceIds)
}

// ---------------------------------------------------------------------------
// A requirement, as the database returns it
// ---------------------------------------------------------------------------

export interface RequirementRow {
  id: string
  project_id: string
  instrument_id: string
  quantity: number
  default_pay: number | null
  notes: string | null
  status: 'open' | 'filled' | 'cancelled'
}

// ---------------------------------------------------------------------------
// Fulfilment: derived from the chairs
// ---------------------------------------------------------------------------

export interface RequirementFulfilment {
  /** How many chairs it asked for. */
  quantity: number
  /** Its chairs still on the gig (fewer than quantity if some were removed). */
  chairs: number
  confirmed: number
  /** Chairs out on an offer, waiting for an answer. */
  offered: number
  /** How many more confirmed people it needs (never negative). */
  needed: number
  state: 'open' | 'filled' | 'cancelled'
}

/** The same rule as 099's trigger: filled once `quantity` of its chairs are confirmed. */
export function requirementFulfilment(
  requirement: { id: string; quantity: number; status?: string | null },
  positions: readonly { requirement_id?: string | null; status: string }[]
): RequirementFulfilment {
  const mine = positions.filter((p) => p.requirement_id === requirement.id)
  const confirmed = mine.filter((p) => p.status === 'confirmed').length
  const offered = mine.filter((p) => p.status === 'offered').length
  const needed = Math.max(0, requirement.quantity - confirmed)
  const state = requirement.status === 'cancelled' ? 'cancelled' : needed === 0 ? 'filled' : 'open'
  return { quantity: requirement.quantity, chairs: mine.length, confirmed, offered, needed, state }
}

// ---------------------------------------------------------------------------
// The projects page's view of a chair's calls
// ---------------------------------------------------------------------------

export interface ChairCallScope {
  scopeMode: 'all' | 'selected'
  /** The calls listed for a 'selected' chair (empty for 'all'). */
  serviceIds: string[]
  requirementId: string | null
}

/** One organization's chairs' calls and requirements, for the projects page. */
export interface CallScopeView {
  chairs: Record<string, ChairCallScope>
  requirements: RequirementRow[]
}

/** A chair's scope in the shape servicesFor reads. */
export function chairScopeForServicesFor(scope: ChairCallScope | null | undefined): PositionScope | null {
  if (!scope) return null
  return { scope_mode: scope.scopeMode, position_services: scope.serviceIds.map((service_id) => ({ service_id })) }
}

// ---------------------------------------------------------------------------
// The staffing alert: chairs of one requirement are one line
// ---------------------------------------------------------------------------

/** How an unfilled chair is grouped in the staffing alert email. */
export interface AlertGroup {
  key: string
  label: string
  quantity: number
}

/**
 * The alert line a chair of a requirement belongs to: its role, the calls it
 * works when it is limited to some ("Stagehand (Load-in)"), and how many the
 * requirement asked for. Two requirements for one role (load-in and strike)
 * stay two lines.
 */
export function alertGroupFor<S extends { id: string; name?: string | null }>(
  position: PositionScope & { id: string },
  instrumentName: string,
  requirement: { id: string; quantity: number } | undefined,
  services: S[]
): AlertGroup | undefined {
  if (!requirement) return undefined
  const calls = position.scope_mode === 'selected' ? servicesFor(position, services).map((s) => s.name || '').filter(Boolean) : []
  return {
    key: `requirement:${requirement.id}`,
    label: calls.length > 0 ? `${instrumentName} (${calls.join(', ')})` : instrumentName,
    quantity: requirement.quantity,
  }
}
