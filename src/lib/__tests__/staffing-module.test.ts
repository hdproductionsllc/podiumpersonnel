import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { MockSupabaseDb } from './helpers/supabase-mock'

/**
 * src/lib/staffing/ building blocks: logEvent() (events.ts), releaseSeat()
 * (seats.ts) and the re-export shims left at the modules' old paths.
 */

const state = vi.hoisted(() => ({
  db: undefined as unknown,
  serviceClient: undefined as (() => unknown) | undefined,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => (state.serviceClient ? state.serviceClient() : state.db),
}))
vi.mock('@/lib/email/send', () => ({}))
vi.mock('@/lib/email/log', () => ({ hasRecentFailure: async () => false }))

import { logEvent, LOG_TIMEOUT_MS, SYSTEM, adminActor, musicianActor, type StaffingEvent } from '@/lib/staffing/events'
import { releaseSeat } from '@/lib/staffing/seats'
// Static, not import() inside the test: respond.ts pulls in the email stack,
// and a cold dynamic import of it overran the 5s test timeout when the whole
// suite ran at once. The email modules are stubbed (only identity is checked).
import * as oldRespond from '@/lib/offers/respond'
import * as newRespond from '@/lib/staffing/respond'
import * as oldCandidates from '@/lib/next-candidate'
import * as newCandidates from '@/lib/staffing/candidates'
import * as oldConflicts from '@/lib/schedule-conflict'
import * as newConflicts from '@/lib/staffing/conflicts'

let errorSpy: MockInstance

beforeEach(() => {
  state.db = new MockSupabaseDb({ staffing_events: [], project_positions: [] })
  state.serviceClient = undefined
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const db = () => state.db as MockSupabaseDb

const EVENT: StaffingEvent = {
  organizationId: 'org-1',
  actor: adminActor('user-1'),
  entityType: 'offer',
  entityId: 'offer-1',
  action: 'offer.rescinded',
  before: { status: 'pending' },
  after: { status: 'rescinded' },
}

describe('logEvent', () => {
  it('writes one row with the columns migration 092 defines', async () => {
    await logEvent(EVENT)

    expect(db().tables.staffing_events).toEqual([
      {
        id: expect.any(String),
        organization_id: 'org-1',
        actor_type: 'admin',
        actor_id: 'user-1',
        entity_type: 'offer',
        entity_id: 'offer-1',
        action: 'offer.rescinded',
        before: { status: 'pending' },
        after: { status: 'rescinded' },
      },
    ])
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('writes several events in a single insert', async () => {
    await logEvent([EVENT, { ...EVENT, entityId: 'offer-2', actor: SYSTEM, before: undefined }])

    expect(db().ops('staffing_events', 'insert')).toHaveLength(1)
    expect(db().tables.staffing_events.map((r) => [r.entity_id, r.actor_type, r.actor_id, r.before])).toEqual([
      ['offer-1', 'admin', 'user-1', { status: 'pending' }],
      ['offer-2', 'system', null, null],
    ])
  })

  it('records a musician as the actor by their roster id', async () => {
    await logEvent({ ...EVENT, actor: musicianActor('mus-1') })
    expect(db().tables.staffing_events[0]).toMatchObject({ actor_type: 'musician', actor_id: 'mus-1' })
  })

  it('skips (and reports) an event with no organization, keeping the rest', async () => {
    await logEvent([{ ...EVENT, organizationId: undefined }, { ...EVENT, entityId: 'offer-2' }])

    expect(db().tables.staffing_events.map((r) => r.entity_id)).toEqual(['offer-2'])
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('does nothing for an empty list', async () => {
    await logEvent([])
    expect(db().ops()).toHaveLength(0)
  })

  it('does not throw when the table is missing (migration 092 not applied yet)', async () => {
    state.serviceClient = () => ({
      from: () => ({
        insert: async () => ({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.staffing_events'" } }),
      }),
    })

    await expect(logEvent(EVENT)).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(String(errorSpy.mock.calls[0][0])).toContain('offer.rescinded offer-1')
  })

  it('does not throw when the client itself throws', async () => {
    state.serviceClient = () => {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
    }

    await expect(logEvent(EVENT)).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('does not throw when the insert rejects', async () => {
    state.serviceClient = () => ({ from: () => ({ insert: () => Promise.reject(new Error('fetch failed')) }) })

    await expect(logEvent(EVENT)).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it(`gives up after ${LOG_TIMEOUT_MS}ms instead of holding the request open`, async () => {
    vi.useFakeTimers()
    state.serviceClient = () => ({ from: () => ({ insert: () => new Promise(() => {}) }) })

    const pending = logEvent(EVENT)
    await vi.advanceTimersByTimeAsync(LOG_TIMEOUT_MS)

    await expect(pending).resolves.toBeUndefined()
    expect(String(errorSpy.mock.calls[0][0])).toContain('not recorded within')
  })
})

describe('releaseSeat', () => {
  beforeEach(() => {
    db().tables.project_positions = [
      { id: 'pos-free', musician_id: null, status: 'offered' },
      { id: 'pos-held', musician_id: 'mus-1', status: 'confirmed' },
    ]
  })

  it.each(['declined', 'expired', 'rescinded'] as const)('%s: frees a chair nobody holds', async (reason) => {
    const result = await releaseSeat(db() as never, 'pos-free', reason)

    expect(result).toEqual({ released: true, error: null })
    expect(db().row('project_positions', 'pos-free')).toMatchObject({ musician_id: null, status: 'vacant' })
  })

  it.each(['declined', 'expired', 'rescinded'] as const)('%s: never evicts a seated musician', async (reason) => {
    const result = await releaseSeat(db() as never, 'pos-held', reason)

    expect(result).toEqual({ released: false, error: null })
    expect(db().row('project_positions', 'pos-held')).toMatchObject({ musician_id: 'mus-1', status: 'confirmed' })
    expect(db().ops('project_positions', 'update')[0].filters).toContainEqual({ method: 'is', args: ['musician_id', null] })
  })

  it('unassigned: clears a held chair on purpose', async () => {
    const result = await releaseSeat(db() as never, 'pos-held', 'unassigned')

    expect(result).toEqual({ released: true, error: null })
    expect(db().row('project_positions', 'pos-held')).toMatchObject({ musician_id: null, status: 'vacant' })
    expect(db().ops('project_positions', 'update')[0].filters).not.toContainEqual({
      method: 'is',
      args: ['musician_id', null],
    })
  })

  it('returns the database error instead of throwing', async () => {
    const failing = {
      from: () => {
        const chain = {
          update: () => chain,
          eq: () => chain,
          is: () => chain,
          select: async () => ({ data: null, error: { message: 'boom' } }),
        }
        return chain
      },
    }

    const result = await releaseSeat(failing as never, 'pos-free', 'declined')
    expect(result).toEqual({ released: false, error: { message: 'boom' } })
  })
})

describe('migration 092 and its paste script', () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, '../../..', rel), 'utf-8').replace(/\r\n/g, '\n')
  const migration = read('supabase/migrations/092_staffing_events.sql')
  const paste = read('scripts/sql/092-staffing-events.paste.sql')

  it('the paste script carries the migration verbatim, inside one transaction', () => {
    const begin = paste.indexOf('\nBEGIN;\n')
    const commit = paste.indexOf('\nCOMMIT;\n')
    expect(begin).toBeGreaterThan(0)
    expect(commit).toBeGreaterThan(begin)
    expect(paste.slice(begin, commit)).toContain(migration.trim())
  })

  it('ends with a RESULTS table', () => {
    expect(paste.slice(paste.indexOf('\nCOMMIT;\n'))).toMatch(/RESULTS[\s\S]*'PASS'/)
  })

  it('gives clients no way to write history', () => {
    expect(migration).not.toMatch(/CREATE POLICY[^;]*FOR (INSERT|UPDATE|DELETE|ALL)/i)
    expect(migration).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON staffing_events FROM authenticated/)
    expect(migration).toMatch(/SET search_path = public, pg_temp/)
  })
})

describe('old import paths still work (re-export shims)', () => {
  it('@/lib/offers/respond is @/lib/staffing/respond', () => {
    const [oldPath, newPath] = [oldRespond, newRespond]
    expect(oldPath.claimChairForAccept).toBe(newPath.claimChairForAccept)
    expect(oldPath.markOfferDeclined).toBe(newPath.markOfferDeclined)
    expect(oldPath.isOfferClosed).toBe(newPath.isOfferClosed)
    expect(oldPath.RESPONDABLE_STATUSES).toEqual(['pending', 'viewed'])
  })

  it('@/lib/next-candidate is @/lib/staffing/candidates', () => {
    const [oldPath, newPath] = [oldCandidates, newCandidates]
    expect(oldPath.getNextCandidates).toBe(newPath.getNextCandidates)
  })

  it('@/lib/schedule-conflict is @/lib/staffing/conflicts', () => {
    const [oldPath, newPath] = [oldConflicts, newConflicts]
    expect(oldPath.findConflicts).toBe(newPath.findConflicts)
    expect(oldPath.describeConflicts).toBe(newPath.describeConflicts)
  })
})
