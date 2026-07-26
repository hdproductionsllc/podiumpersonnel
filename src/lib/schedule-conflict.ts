/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Is this musician busy when we need them?
 *
 * There are two ways to be busy, and the app used to check them in different
 * places with different code:
 *
 *   1. An outside commitment the contractor typed in (competing_schedules).
 *   2. An active offer on ANOTHER Podium project whose services overlap.
 *
 * The candidate ranking and auto-populate only ever checked (1). The send-offer
 * dialog only ever checked (2). So "who should I call next" would confidently
 * suggest a cellist already confirmed on another of your own quartets that
 * night, and the warning only appeared later — in a different dialog, if anyone
 * looked. For a contractor running several ensembles off one musician pool,
 * that is the exact case that matters.
 *
 * This module is the single answer both sources feed into.
 */

/**
 * How long to assume a service runs when it has no end_time.
 *
 * Deliberately generous: for a conflict WARNING, over-warning costs a second
 * glance while under-warning costs a double-booked chair. next-candidate and
 * auto-populate already assumed 3 hours; the send-offer dialog assumed 1, which
 * meant the two could disagree at the margin. 3 hours wins.
 */
export const ASSUMED_SERVICE_MS = 3 * 60 * 60 * 1000

export type TimeWindow = { start: number; end: number }

export type ConflictSource = 'external' | 'project'

export type Conflict = {
  source: ConflictSource
  /** "Spring Gala" for a project, or the commitment's title for an external one. */
  label: string
  /** True only for an accepted offer — a pending one is a hold, not a booking. */
  confirmed: boolean
}

/** Half-open overlap: touching end-to-start is not a conflict. */
export function overlaps(a: TimeWindow, b: TimeWindow): boolean {
  return a.start < b.end && b.start < a.end
}

/** Normalize a service row to a time window, filling in a missing end_time. */
export function serviceWindow(service: {
  start_time: string
  end_time?: string | null
}): TimeWindow | null {
  const start = new Date(service.start_time).getTime()
  if (Number.isNaN(start)) return null

  const parsedEnd = service.end_time ? new Date(service.end_time).getTime() : NaN

  // Only fall back to the assumed duration when there is no usable end time.
  // Clamping every service up to the assumed length would inflate a real 2-hour
  // call into 3 and invent conflicts with whatever follows it that evening.
  const end =
    Number.isNaN(parsedEnd) || parsedEnd <= start ? start + ASSUMED_SERVICE_MS : parsedEnd

  return { start, end }
}

function toWindows(rows: { start_time: string; end_time?: string | null }[]): TimeWindow[] {
  return rows.map(serviceWindow).filter((w): w is TimeWindow => w !== null)
}

/** Does any window in `a` overlap any window in `b`? */
export function anyOverlap(a: TimeWindow[], b: TimeWindow[]): boolean {
  return a.some((x) => b.some((y) => overlaps(x, y)))
}

/**
 * Find every conflict for a set of musicians against the given services.
 *
 * Batched on purpose: callers rank a whole roster, so this issues a fixed number
 * of queries regardless of how many musicians are passed rather than one per
 * musician.
 *
 * `excludeProjectId` is the project being staffed — its own offers are not a
 * conflict with itself.
 */
export async function findConflicts(
  supabase: SupabaseClient,
  opts: {
    musicianIds: string[]
    services: { start_time: string; end_time?: string | null }[]
    excludeProjectId: string
    /** Pre-fetched competing_schedules, keyed by musician id, to avoid a re-query. */
    externalByMusician?: Map<string, { title: string; start_time: string; end_time: string }[]>
  }
): Promise<Map<string, Conflict[]>> {
  const result = new Map<string, Conflict[]>()
  const ourWindows = toWindows(opts.services)

  if (opts.musicianIds.length === 0 || ourWindows.length === 0) return result

  const add = (musicianId: string, conflict: Conflict) => {
    const list = result.get(musicianId)
    if (list) list.push(conflict)
    else result.set(musicianId, [conflict])
  }

  // ---- 1. Outside commitments the contractor recorded -----------------------
  if (opts.externalByMusician) {
    for (const [musicianId, schedules] of opts.externalByMusician) {
      for (const sched of schedules) {
        const window = serviceWindow(sched)
        if (window && anyOverlap([window], ourWindows)) {
          add(musicianId, {
            source: 'external',
            label: sched.title || 'Outside commitment',
            confirmed: true,
          })
        }
      }
    }
  }

  // ---- 2. Active offers on other Podium projects ---------------------------
  const { data: otherOffers } = await supabase
    .from('contract_offers')
    .select(`
      musician_id,
      status,
      expires_at,
      project_position:project_positions!inner(
        project_id,
        project:projects!inner(id, name)
      )
    `)
    .in('musician_id', opts.musicianIds)
    .in('status', ['pending', 'viewed', 'accepted'])

  if (!otherOffers || otherOffers.length === 0) return result

  // A pending offer that has already lapsed holds nothing.
  const now = Date.now()
  const live = (otherOffers as any[]).filter((o) => {
    if (o.status === 'accepted') return true
    return !o.expires_at || new Date(o.expires_at).getTime() > now
  })

  const relevant = live.filter(
    (o) => o.project_position?.project_id && o.project_position.project_id !== opts.excludeProjectId
  )

  if (relevant.length === 0) return result

  const otherProjectIds = [...new Set(relevant.map((o) => o.project_position.project_id))]

  const { data: otherServices } = await supabase
    .from('services')
    .select('project_id, start_time, end_time')
    .in('project_id', otherProjectIds)

  if (!otherServices || otherServices.length === 0) return result

  // Which of those projects actually clash with ours, by time.
  const clashingProjects = new Set<string>()
  for (const projectId of otherProjectIds) {
    const windows = toWindows(
      (otherServices as any[]).filter((s) => s.project_id === projectId)
    )
    if (anyOverlap(windows, ourWindows)) clashingProjects.add(projectId)
  }

  if (clashingProjects.size === 0) return result

  for (const offer of relevant) {
    const projectId = offer.project_position.project_id
    if (!clashingProjects.has(projectId)) continue

    add(offer.musician_id, {
      source: 'project',
      label: offer.project_position.project?.name || 'another project',
      confirmed: offer.status === 'accepted',
    })
  }

  return result
}

/**
 * One short line explaining the strongest conflict, for a list row.
 * Confirmed bookings outrank pending holds — that is the one worth reading first.
 */
export function describeConflicts(conflicts: Conflict[] | undefined): string | null {
  if (!conflicts || conflicts.length === 0) return null

  const ranked = [...conflicts].sort((a, b) => Number(b.confirmed) - Number(a.confirmed))
  const primary = ranked[0]
  const others = ranked.length - 1

  const base =
    primary.source === 'project'
      ? primary.confirmed
        ? `Booked on ${primary.label}`
        : `Pending offer on ${primary.label}`
      : primary.label

  return others > 0 ? `${base} (+${others} more)` : base
}
