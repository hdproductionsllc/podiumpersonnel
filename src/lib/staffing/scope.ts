import { isMissingColumn } from './rpc'

/**
 * Which services a chair works (migration 098, target architecture 3.4).
 *
 * Every chair used to work every service of its gig, and every reader that
 * shows a person their gig, pays them, or checks whether they are free took
 * "the gig's services" for granted. A chair can now name the services it works:
 *
 *   project_positions.scope_mode = 'all'       every service of the gig. Every
 *                                              existing chair, and the default.
 *   project_positions.scope_mode = 'selected'  only the services listed in
 *                                              position_services. None listed
 *                                              means NONE: it never widens back
 *                                              to the whole gig by itself.
 *
 * servicesFor() is the one answer every reader asks. For a chair in 'all' mode
 * (and for a row read without the scope fields, or before 098 exists) it
 * returns the very array it was given, so nothing downstream can tell the
 * difference: same objects, same order, same in-place sorts.
 *
 * The database only lets a chair be 'selected' in an organization with
 * organizations.call_scoped_requirements on (098's triggers), so for every
 * organization with it off, which is every organization today, every chair is
 * 'all' and servicesFor changes nothing. Readers need not check the switch.
 *
 * The SQL twin is services_for_position() (098), used by cascade_offer and
 * worker_drop.
 */

/** The fields a chair's scope is read from, for a PostgREST select. */
export const POSITION_SCOPE_FIELDS = 'scope_mode, position_services(service_id)'

export type ScopeMode = 'all' | 'selected'

/** What servicesFor reads off a chair row. Both absent reads as 'all'. */
export interface PositionScope {
  scope_mode?: string | null
  position_services?: readonly { service_id: string }[] | null
}

/** True only for a chair limited to its listed services. */
export function isScoped(position: PositionScope | null | undefined): boolean {
  return position?.scope_mode === 'selected'
}

/**
 * The services this chair works, out of its gig's services.
 *
 * 'all' (or no scope on the row): `services` itself, unchanged.
 * 'selected': the listed ones, in the order given; none listed, none.
 */
export function servicesFor<S extends { id: string }>(position: PositionScope | null | undefined, services: S[]): S[]
export function servicesFor<S extends { id: string }>(
  position: PositionScope | null | undefined,
  services: S[] | null | undefined
): S[] | null | undefined
export function servicesFor<S extends { id: string }>(
  position: PositionScope | null | undefined,
  services: S[] | null | undefined
): S[] | null | undefined {
  if (!isScoped(position)) return services
  const listed = new Set((position?.position_services || []).map((ps) => ps.service_id))
  return (services || []).filter((s) => listed.has(s.id))
}

/**
 * The services one person works on a gig: everything their chairs on it work,
 * in the order given. A person on no chair of the gig (unassigned since a
 * send, say) gets every service, as they always did.
 */
export function servicesForMusician<S extends { id: string }>(
  positions: readonly (PositionScope & { musician_id?: string | null })[] | null | undefined,
  musicianId: string | null | undefined,
  services: S[]
): S[] {
  const theirs = (positions || []).filter((p) => !!musicianId && p.musician_id === musicianId)
  if (theirs.length === 0 || theirs.some((p) => !isScoped(p))) return services
  const worked = new Set(theirs.flatMap((p) => servicesFor(p, services).map((s) => s.id)))
  return services.filter((s) => worked.has(s.id))
}

/** True when an error says the 098 scope fields are not in the database yet. */
export function isMissingScope(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null
  const named = /scope_mode|position_services/.test(e?.message ?? '')
  // 42703 / PGRST204: the column; PGRST200: the embedded table.
  return named && (isMissingColumn(error) || e?.code === 'PGRST200')
}

/**
 * What withScope puts in a chair's field list: the scope fields with their
 * leading comma. Typed as that exact string (not `string`) so the Supabase
 * client can still read the select text and type its rows. In the one case
 * where the database lacks 098, withScope passes '' instead, and the rows
 * simply have no scope fields, which servicesFor reads as 'all'.
 */
const WITH_SCOPE_FIELDS = `, ${POSITION_SCOPE_FIELDS}` as const
export type ScopeSelect = typeof WITH_SCOPE_FIELDS
const WITHOUT_SCOPE_FIELDS = '' as ScopeSelect

let reportedMissing098 = false

/**
 * Run a select that reads chairs' scope. `run` is given the text to put in the
 * chair's field list, with its leading comma (", scope_mode, ..."), e.g.
 *
 *   withScope((scope) => supabase.from('project_positions').select(`id, chair_number${scope}`))
 *
 * If the database does not have 098 yet, the same select is run again without
 * the scope fields (every chair then reads as 'all', which is what every chair
 * is until 098 exists) and the missing migration is logged once per server
 * process. Any other result, success or error, is returned as it came.
 */
export async function withScope<R extends { error: unknown }>(run: (scope: ScopeSelect) => PromiseLike<R>): Promise<R> {
  const first = await run(WITH_SCOPE_FIELDS)
  if (!first.error || !isMissingScope(first.error)) return first
  if (!reportedMissing098) {
    reportedMissing098 = true
    console.warn(
      'chair scope unavailable: migration 098 (scripts/sql/098-position-services.paste.sql) has not been applied; ' +
        'every chair reads as working every service (reported once per server process)'
    )
  }
  return run(WITHOUT_SCOPE_FIELDS)
}
