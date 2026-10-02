import type { MockRpc, MockSupabaseDb, Row } from './supabase-mock'

/**
 * In-memory stand-ins for the two staffing database functions of migration
 * 094, claim_chair and create_offer, so route tests on MockSupabaseDb can run
 * the real server code end to end.
 *
 * They follow supabase/migrations/094_cascade_constraints.sql step for step
 * (same checks in the same order, same rows written, same staffing_events).
 * The SQL itself, its locking and its behaviour under real concurrency, is
 * tested against Postgres in src/lib/__tests__/db/staffing-rpcs.test.ts; if
 * the two ever disagree, the SQL is right and this file is the bug.
 *
 * Each runs inside db.transaction(): a write that a constraint refuses
 * (db.constraint, e.g. oneLiveOfferPerChair) throws, and every write the call
 * made is rolled back, as Postgres would.
 *
 * Fixture leniency: some route tests seed only the rows a route reads, so a
 * missing projects/musicians row counts as active, and the organization falls
 * back to the position's embedded project.
 */

export class MockPgError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message)
  }
}

const LIVE = ['pending', 'viewed']

function table(db: MockSupabaseDb, name: string): Row[] {
  return (db.tables[name] ??= [])
}

/** An UPDATE of one row, checked against db.constraint first. */
function write(db: MockSupabaseDb, name: string, row: Row, patch: Row) {
  const candidate = { ...row, ...patch }
  const error = db.constraint?.(name, candidate, table(db, name).filter((r) => r !== row))
  if (error) throw new MockPgError(error.message, error.code)
  Object.assign(row, patch)
}

function insert(db: MockSupabaseDb, name: string, row: Row) {
  const error = db.constraint?.(name, row, table(db, name))
  if (error) throw new MockPgError(error.message, error.code)
  table(db, name).push(row)
}

function nextId(db: MockSupabaseDb, name: string): string {
  const rows = table(db, name)
  let n = rows.length + 1
  while (rows.some((r) => r.id === `${name}-${n}`)) n++
  return `${name}-${n}`
}

function logStaffingEvent(
  db: MockSupabaseDb,
  e: { org: unknown; actorType: string; actorId: unknown; entityType: string; entityId: unknown; action: string; before?: Row | null; after?: Row | null }
) {
  const rows = table(db, 'staffing_events')
  rows.push({
    id: `staffing_events-${rows.length + 1}`,
    organization_id: e.org,
    actor_type: e.actorType,
    actor_id: e.actorId ?? null,
    entity_type: e.entityType,
    entity_id: e.entityId,
    action: e.action,
    before: e.before ?? null,
    after: e.after ?? null,
  })
}

function projectOf(db: MockSupabaseDb, pos: Row): Row | null {
  return db.row('projects', pos.project_id) ?? pos.project ?? pos.projects ?? null
}

// ---------------------------------------------------------------------------

export function claimChair(db: MockSupabaseDb, args: { p_offer_id: string }): string {
  const nowIso = new Date().toISOString()
  const offer = db.row('contract_offers', args.p_offer_id)
  if (!offer) return 'already_responded'
  const pos = db.row('project_positions', offer.project_position_id)
  if (
    !pos ||
    !LIVE.includes(offer.status) ||
    (offer.expires_at && new Date(offer.expires_at).getTime() < Date.now())
  ) {
    return 'already_responded'
  }

  const project = projectOf(db, pos)
  const org = project?.organization_id ?? null
  if (project?.status === 'cancelled' || project?.status === 'completed') return 'project_inactive'
  if (db.row('musicians', offer.musician_id)?.is_active === false) return 'musician_inactive'

  const sub = table(db, 'substitution_requests').find((r) => r.offer_id === offer.id && r.status === 'approved')
  const actor = { actorType: 'musician', actorId: offer.musician_id }
  const lost = sub ? pos.musician_id !== sub.requesting_musician_id : pos.musician_id != null

  if (lost) {
    const before = offer.status
    write(db, 'contract_offers', offer, { status: 'superseded', responded_at: nowIso })
    logStaffingEvent(db, {
      org, ...actor, entityType: 'offer', entityId: offer.id, action: 'offer.superseded',
      before: { status: before },
      after: { status: 'superseded', reason: 'position_filled', position_id: pos.id, musician_id: offer.musician_id },
    })
    if (sub) {
      write(db, 'substitution_requests', sub, { status: 'cancelled' })
      logStaffingEvent(db, {
        org, ...actor, entityType: 'substitution_request', entityId: sub.id, action: 'substitution.ended',
        before: { status: 'approved' },
        after: { status: 'cancelled', reason: 'position_filled', offer_id: offer.id },
      })
    }
    return 'position_filled'
  }

  if (sub) {
    for (const original of table(db, 'contract_offers').filter(
      (o) => o.project_position_id === pos.id && o.musician_id === sub.requesting_musician_id && o.status === 'accepted'
    )) {
      write(db, 'contract_offers', original, { status: 'released' })
      logStaffingEvent(db, {
        org, ...actor, entityType: 'offer', entityId: original.id, action: 'offer.released',
        before: { status: 'accepted' },
        after: { status: 'released', reason: 'substitute_accepted', musician_id: sub.requesting_musician_id, substitution_request_id: sub.id },
      })
    }
  }

  const before = offer.status
  write(db, 'contract_offers', offer, { status: 'accepted', responded_at: nowIso })
  write(db, 'project_positions', pos, { musician_id: offer.musician_id, status: 'confirmed' })
  logStaffingEvent(db, {
    org, ...actor, entityType: 'offer', entityId: offer.id, action: 'offer.accepted',
    before: { status: before },
    after: {
      status: 'accepted', position_id: pos.id, musician_id: offer.musician_id,
      ...(sub ? { substitution_request_id: sub.id } : {}),
    },
  })

  if (sub) {
    write(db, 'substitution_requests', sub, { status: 'filled' })
    logStaffingEvent(db, {
      org, ...actor, entityType: 'substitution_request', entityId: sub.id, action: 'substitution.filled',
      before: { status: 'approved' },
      after: { status: 'filled', offer_id: offer.id, substitute_musician_id: offer.musician_id },
    })
  }

  for (const other of table(db, 'contract_offers').filter(
    (o) => o.project_position_id === pos.id && o.id !== offer.id && LIVE.includes(o.status)
  )) {
    write(db, 'contract_offers', other, { status: 'superseded', responded_at: nowIso })
    logStaffingEvent(db, {
      org, ...actor, entityType: 'offer', entityId: other.id, action: 'offer.superseded',
      after: { status: 'superseded', reason: 'chair_filled', position_id: pos.id, musician_id: other.musician_id, replaced_by: offer.id },
    })
    for (const request of table(db, 'substitution_requests').filter((r) => r.offer_id === other.id && r.status === 'approved')) {
      write(db, 'substitution_requests', request, { status: 'cancelled' })
      logStaffingEvent(db, {
        org, ...actor, entityType: 'substitution_request', entityId: request.id, action: 'substitution.ended',
        before: { status: 'approved' },
        after: { status: 'cancelled', reason: 'chair_filled', offer_id: other.id },
      })
    }
  }

  return 'claimed'
}

// ---------------------------------------------------------------------------

export interface CreateOfferArgs {
  p_position_id: string
  p_musician_id: string
  p_created_by: string
  p_expires_at?: string | null
  p_custom_pay?: number | null
  p_personal_message?: string | null
  p_terms_snapshot?: Row | null
  p_delivery_status?: string | null
  p_supersede?: boolean
}

export function createOffer(db: MockSupabaseDb, args: CreateOfferArgs): Row {
  const nowIso = new Date().toISOString()
  const pos = db.row('project_positions', args.p_position_id)
  if (!pos) return { result: 'not_found', what: 'position' }

  const project = projectOf(db, pos)
  const org = project?.organization_id ?? null
  const member = table(db, 'organization_members').find(
    (m) => m.user_id === args.p_created_by && m.organization_id === org
  )
  if (!member || !['owner', 'admin'].includes(member.role)) return { result: 'forbidden' }

  const musician = db.row('musicians', args.p_musician_id)
  if (!musician) return { result: 'not_found', what: 'musician' }
  if (musician.organization_id !== org) return { result: 'wrong_organization' }
  if (project?.status === 'cancelled' || project?.status === 'completed') return { result: 'gig_closed' }
  if (musician.is_active === false) return { result: 'musician_inactive' }
  if (pos.musician_id != null) return { result: 'chair_filled' }

  const gigChairs = new Set(
    table(db, 'project_positions').filter((p) => p.project_id === pos.project_id).map((p) => p.id)
  )
  const offers = table(db, 'contract_offers')
  if (
    offers.some(
      (o) =>
        gigChairs.has(o.project_position_id) &&
        o.musician_id === args.p_musician_id &&
        ['pending', 'viewed', 'accepted'].includes(o.status)
    )
  ) {
    return { result: 'musician_has_active_offer' }
  }

  const retired: Row[] = []
  if (args.p_supersede !== false) {
    const live = offers
      .filter((o) => o.project_position_id === pos.id && LIVE.includes(o.status))
      .sort((a, b) => String(a.sent_at ?? '').localeCompare(String(b.sent_at ?? '')))
    for (const o of live) {
      retired.push({
        id: o.id,
        musician_id: o.musician_id,
        previous_status: o.status,
        expires_at: o.expires_at ?? null,
        is_substitution: o.is_substitution === true,
      })
      write(db, 'contract_offers', o, { status: 'superseded', responded_at: nowIso })
    }
  } else if (offers.some((o) => o.project_position_id === pos.id && LIVE.includes(o.status) && o.is_substitution !== true)) {
    return { result: 'chair_has_live_offer' }
  }

  const id = nextId(db, 'contract_offers')
  const offer: Row = {
    id,
    token: `tok-${id}`,
    project_position_id: pos.id,
    musician_id: args.p_musician_id,
    status: 'pending',
    sent_at: nowIso,
    expires_at: args.p_expires_at ?? null,
    responded_at: null,
    viewed_at: null,
    response_notes: null,
    custom_pay: args.p_custom_pay ?? null,
    personal_message: args.p_personal_message ?? null,
    created_by: args.p_created_by,
    terms_snapshot: args.p_terms_snapshot ?? null,
    delivery_status: args.p_delivery_status ?? null,
    is_substitution: false,
  }
  insert(db, 'contract_offers', offer)

  if (pos.status !== 'offered') write(db, 'project_positions', pos, { status: 'offered' })

  for (const o of retired) {
    logStaffingEvent(db, {
      org, actorType: 'admin', actorId: args.p_created_by, entityType: 'offer', entityId: o.id, action: 'offer.superseded',
      after: { status: 'superseded', position_id: pos.id, musician_id: o.musician_id, replaced_by: id },
    })
    for (const request of table(db, 'substitution_requests').filter((r) => r.offer_id === o.id && r.status === 'approved')) {
      write(db, 'substitution_requests', request, { status: 'cancelled' })
      logStaffingEvent(db, {
        org, actorType: 'admin', actorId: args.p_created_by, entityType: 'substitution_request', entityId: request.id,
        action: 'substitution.ended',
        before: { status: 'approved' },
        after: { status: 'cancelled', reason: 'offer_superseded', offer_id: o.id, replaced_by: id },
      })
    }
  }
  logStaffingEvent(db, {
    org, actorType: 'admin', actorId: args.p_created_by, entityType: 'offer', entityId: id, action: 'offer.created',
    after: { status: 'pending', position_id: pos.id, musician_id: args.p_musician_id, expires_at: offer.expires_at },
  })

  return {
    result: 'created',
    offer: {
      id,
      token: offer.token,
      expires_at: offer.expires_at,
      custom_pay: offer.custom_pay,
      personal_message: offer.personal_message,
    },
    superseded: retired,
  }
}

/** The functions MockSupabaseDb.rpc() knows by default. */
export const STAFFING_RPCS: Record<string, MockRpc> = {
  claim_chair: claimChair,
  create_offer: createOffer,
}
