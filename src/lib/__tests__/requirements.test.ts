import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Requirements and the per-chair call picker (migration 099,
 * src/lib/staffing/requirements.ts and requirement-rules.ts), without a
 * database: the migration and paste script as text, what a request may
 * contain, how each database answer reaches the admin, the projects page's
 * read (nothing at all for an organization with the switch off), fulfilment,
 * and the two routes. The database itself is tested in db/requirements.test.ts.
 */

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  admin: { user: { id: 'user-admin' } as { id: string } | null, error: null as unknown },
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ rpc: state.rpc }),
}))

vi.mock('@/lib/api-helpers', () => ({
  requireOrgAdmin: async () => ({ supabase: null, user: state.admin.user, membership: { organization_id: 'org-1' }, error: state.admin.error }),
  apiSuccess: (data: unknown, status = 200) => NextResponse.json(data, { status }),
  apiError: (message: string, status = 400) => NextResponse.json({ error: message }, { status }),
}))

import {
  MAX_REQUIREMENT_QUANTITY,
  alertGroupFor,
  callScopeChairServices,
  chairFirstCalls,
  chairScopeForServicesFor,
  createRequirement,
  getCallScopeView,
  parseChairScopeInput,
  parseRequirementInput,
  requirementFulfilment,
  setChairScope,
  startsAtForChair,
} from '@/lib/staffing/requirements'
import { POST as requirementsPOST } from '@/app/api/projects/[projectId]/requirements/route'
import { PUT as scopePUT } from '@/app/api/positions/[positionId]/scope/route'

const read = (rel: string) => readFileSync(resolve(__dirname, '../../..', rel), 'utf-8').replace(/\r\n/g, '\n')
const migration = read('supabase/migrations/099_requirements.sql')
const paste = read('scripts/sql/099-requirements.paste.sql')
const code = (sql: string) => sql.replace(/--.*$/gm, '')

const ROLE = '11111111-1111-4111-8111-111111111111'
const REQ_KEY = '22222222-2222-4222-8222-222222222222'
const LOAD_IN = '33333333-3333-4333-8333-333333333333'
const STRIKE = '44444444-4444-4444-8444-444444444444'

afterEach(() => {
  vi.restoreAllMocks()
})

beforeEach(() => {
  state.rpc.mockReset()
  state.admin = { user: { id: 'user-admin' }, error: null }
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('migration 099 and its paste script', () => {
  it('the paste script carries the migration verbatim, inside one transaction, and records 099', () => {
    const begin = paste.indexOf('\nBEGIN;\n')
    const commit = paste.indexOf('\nCOMMIT;\n')
    expect(begin).toBeGreaterThan(0)
    expect(commit).toBeGreaterThan(begin)
    expect(paste.slice(begin, commit)).toContain(migration.trim())
    expect(paste.slice(begin, commit)).toContain("VALUES ('099', '099_requirements')")
    expect(paste.slice(paste.indexOf('\nCOMMIT;\n'))).toMatch(/RESULTS[\s\S]*'PASS'/)
  })

  it('changes no existing row and turns nothing on', () => {
    // Outside the function bodies (which only run when called), nothing writes a row.
    const sql = code(migration).replace(/\$\$[\s\S]*?\$\$/g, '')
    expect(sql).not.toMatch(/\b(UPDATE|INSERT INTO|DELETE FROM)\s+(organizations|project_positions|projects|position_services|requirements)\b/i)
    expect(sql).not.toMatch(/SET\s+call_scoped_requirements/i)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS requirement_id uuid REFERENCES requirements\(id\) ON DELETE SET NULL;/)
  })

  it('has no pay basis: default_pay is one whole-engagement amount', () => {
    expect(code(migration)).not.toMatch(/pay_basis/i)
    expect(code(migration)).toMatch(/default_pay\s+numeric\(10,2\)/)
  })

  it('the status trigger only ever runs for a chair made by a requirement', () => {
    const sql = code(migration)
    expect(sql).toMatch(/AFTER INSERT ON project_positions\s+FOR EACH ROW WHEN \(NEW\.requirement_id IS NOT NULL\)/)
    expect(sql).toMatch(/AFTER UPDATE OF status, requirement_id ON project_positions\s+FOR EACH ROW WHEN \(NEW\.requirement_id IS NOT NULL OR OLD\.requirement_id IS NOT NULL\)/)
    expect(sql).toMatch(/AFTER DELETE ON project_positions\s+FOR EACH ROW WHEN \(OLD\.requirement_id IS NOT NULL\)/)
  })

  it('both functions are for the server only and refuse an organization with the switch off', () => {
    const sql = code(migration)
    for (const sig of ['create_requirement(UUID, UUID, INTEGER, UUID, UUID[], NUMERIC, TEXT, UUID)', 'set_position_scope(UUID, UUID, UUID[])']) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION ${sig}`)
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${sig.replace(/[()[\]]/g, '\\$&')}\\s+TO service_role;`))
    }
    expect(sql.match(/RETURN jsonb_build_object\('result', 'not_enabled'\)/g)).toHaveLength(2)
    // Browsers cannot write a requirement at all.
    expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON requirements FROM authenticated;')
  })

  it('the quantity cap is the same in the database and the app', () => {
    expect(code(migration)).toContain(`p_quantity > ${MAX_REQUIREMENT_QUANTITY}`)
  })
})

describe('what a request may contain', () => {
  const good = { instrumentId: ROLE, quantity: 8, serviceIds: [LOAD_IN], defaultPay: 200, notes: '  bring gloves ', requestId: REQ_KEY }

  it('reads a full request', () => {
    expect(parseRequirementInput(good)).toEqual({
      ok: true,
      value: { instrumentId: ROLE, quantity: 8, serviceIds: [LOAD_IN], defaultPay: 200, notes: 'bring gloves', requestId: REQ_KEY },
    })
  })

  it('null calls means every call; pay and notes are optional; duplicates collapse', () => {
    const r = parseRequirementInput({ ...good, serviceIds: null, defaultPay: '', notes: '' })
    expect(r).toMatchObject({ ok: true, value: { serviceIds: null, defaultPay: null, notes: null } })
    expect(parseRequirementInput({ ...good, serviceIds: [LOAD_IN, LOAD_IN, STRIKE] })).toMatchObject({ value: { serviceIds: [LOAD_IN, STRIKE] } })
  })

  it.each([
    ['no role', { instrumentId: undefined }],
    ['no request id', { requestId: undefined }],
    ['zero', { quantity: 0 }],
    ['a fraction', { quantity: 2.5 }],
    ['too many', { quantity: MAX_REQUIREMENT_QUANTITY + 1 }],
    ['negative pay', { defaultPay: -1 }],
    ['calls that are not ids', { serviceIds: ['load-in'] }],
    ['calls that are not a list', { serviceIds: 'all' }],
  ])('refuses %s', (_label, patch) => {
    expect(parseRequirementInput({ ...good, ...patch }).ok).toBe(false)
  })

  it('the call picker: null is every call, a list is those calls, nothing is refused', () => {
    expect(parseChairScopeInput({ serviceIds: null })).toEqual({ ok: true, value: null })
    expect(parseChairScopeInput({ serviceIds: [STRIKE] })).toEqual({ ok: true, value: [STRIKE] })
    expect(parseChairScopeInput({}).ok).toBe(false)
    expect(parseChairScopeInput(null).ok).toBe(false)
  })
})

describe('createRequirement: how the database answer reaches the admin', () => {
  const input = { instrumentId: ROLE, quantity: 8, serviceIds: [LOAD_IN], defaultPay: 200, notes: null, requestId: REQ_KEY }
  const requirement = { id: 'req-1', project_id: 'proj-1', instrument_id: ROLE, quantity: 8, default_pay: 200, notes: null, status: 'open' }

  it('passes exactly what was asked, as the admin', async () => {
    state.rpc.mockResolvedValue({ data: { result: 'created', requirement, position_ids: ['p1', 'p2'] }, error: null })
    const out = await createRequirement('user-admin', 'proj-1', input)
    expect(state.rpc).toHaveBeenCalledWith('create_requirement', {
      p_project_id: 'proj-1',
      p_instrument_id: ROLE,
      p_quantity: 8,
      p_created_by: 'user-admin',
      p_service_ids: [LOAD_IN],
      p_default_pay: 200,
      p_notes: null,
      p_request_key: REQ_KEY,
    })
    expect(out).toEqual({ ok: true, created: true, requirement, positionIds: ['p1', 'p2'] })
  })

  it('a retry returns what the first request made', async () => {
    state.rpc.mockResolvedValue({ data: { result: 'existing', requirement, position_ids: ['p1'] }, error: null })
    expect(await createRequirement('user-admin', 'proj-1', input)).toMatchObject({ ok: true, created: false, positionIds: ['p1'] })
  })

  it.each([
    [{ result: 'not_found', what: 'project' }, 404, 'not_found'],
    [{ result: 'not_found', what: 'instrument' }, 404, 'not_found'],
    [{ result: 'forbidden' }, 403, 'forbidden'],
    [{ result: 'not_enabled' }, 409, 'not_enabled'],
    [{ result: 'gig_closed' }, 409, 'gig_closed'],
    [{ result: 'invalid_quantity' }, 400, 'invalid'],
    [{ result: 'invalid_pay' }, 400, 'invalid'],
    [{ result: 'no_services' }, 400, 'no_services'],
    [{ result: 'wrong_service' }, 400, 'wrong_service'],
    [{ result: 'request_key_reused' }, 409, 'request_key_reused'],
    [{ result: 'something new' }, 500, 'failed'],
  ])('%j -> %i %s', async (data, status, codeName) => {
    state.rpc.mockResolvedValue({ data, error: null })
    expect(await createRequirement('user-admin', 'proj-1', input)).toMatchObject({ ok: false, status, code: codeName })
  })

  it('the same key on two gigs at the same moment (the unique index answers): request_key_reused, not a 500', async () => {
    state.rpc.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint "requirements_request_key_key"' },
    })
    expect(await createRequirement('user-admin', 'proj-1', input)).toMatchObject({ ok: false, status: 409, code: 'request_key_reused' })
    state.rpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "something_else"' } })
    expect(await createRequirement('user-admin', 'proj-1', input)).toMatchObject({ ok: false, status: 500, code: 'failed' })
  })

  it('before 099 is pasted: refused, nothing changed, and the log says which script', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.create_requirement' } })
    expect(await createRequirement('user-admin', 'proj-1', input)).toMatchObject({ ok: false, status: 503, code: 'not_ready' })
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).toContain('099-requirements.paste.sql')
  })
})

describe('setChairScope', () => {
  it('passes the chair, the admin and the calls', async () => {
    state.rpc.mockResolvedValue({ data: { result: 'updated' }, error: null })
    expect(await setChairScope('user-admin', 'pos-1', [STRIKE])).toEqual({ ok: true, changed: true })
    expect(state.rpc).toHaveBeenCalledWith('set_position_scope', { p_position_id: 'pos-1', p_updated_by: 'user-admin', p_service_ids: [STRIKE] })
    state.rpc.mockResolvedValue({ data: { result: 'unchanged' }, error: null })
    expect(await setChairScope('user-admin', 'pos-1', null)).toEqual({ ok: true, changed: false })
  })

  it.each([
    ['chair_in_use', 409],
    ['not_enabled', 409],
    ['forbidden', 403],
    ['not_found', 404],
    ['no_services', 400],
    ['wrong_service', 400],
  ])('%s -> %i', async (result, status) => {
    state.rpc.mockResolvedValue({ data: { result }, error: null })
    expect(await setChairScope('user-admin', 'pos-1', [STRIKE])).toMatchObject({ ok: false, status, code: result })
  })

  it('before 099 is pasted: refused', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: '42883', message: 'function set_position_scope(uuid, uuid, uuid[]) does not exist' } })
    expect(await setChairScope('user-admin', 'pos-1', null)).toMatchObject({ ok: false, status: 503, code: 'not_ready' })
  })
})

type Read = { table: string; in?: string[]; range?: [number, number] }
type Answer = { data: unknown; error: unknown }

/**
 * A client whose reads answer per table (an answer, or a function of the read
 * for paging), recording each read with its `in` list and `range`.
 */
function fakeSupabase(answers: Record<string, Answer | ((read: Read) => Answer)>) {
  const reads: string[] = []
  const log: Read[] = []
  const client = {
    from(table: string) {
      reads.push(table)
      const read: Read = { table }
      log.push(read)
      const answer = () => {
        const a = answers[table] ?? { data: [], error: null }
        return typeof a === 'function' ? a(read) : a
      }
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order']) chain[m] = () => chain
      chain.in = (_col: string, ids: string[]) => ((read.in = ids), chain)
      chain.range = (from: number, to: number) => ((read.range = [from, to]), chain)
      chain.maybeSingle = () => Promise.resolve(answer())
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(answer()).then(res, rej)
      return chain
    },
  }
  return { client: client as unknown as SupabaseClient, reads, log }
}

describe('getCallScopeView: the projects page shows calls and requirements only where the switch is on', () => {
  it('switch off (every organization today): null, and nothing else is read', async () => {
    const { client, reads } = fakeSupabase({ organizations: { data: { call_scoped_requirements: false }, error: null } })
    expect(await getCallScopeView(client, 'org-1', ['proj-1'])).toBeNull()
    expect(reads).toEqual(['organizations'])
  })

  it('before 098 (no switch column): null, quietly', async () => {
    const { client, reads } = fakeSupabase({ organizations: { data: null, error: { code: '42703', message: 'column organizations.call_scoped_requirements does not exist' } } })
    expect(await getCallScopeView(client, 'org-1', ['proj-1'])).toBeNull()
    expect(reads).toEqual(['organizations'])
    expect(console.error).not.toHaveBeenCalled()
  })

  it('switch on but 099 missing: null', async () => {
    const { client } = fakeSupabase({
      organizations: { data: { call_scoped_requirements: true }, error: null },
      project_positions: { data: null, error: { code: '42703', message: 'column project_positions.requirement_id does not exist' } },
    })
    expect(await getCallScopeView(client, 'org-1', ['proj-1'])).toBeNull()
  })

  it('switch on: every chair\'s calls and requirement, and the requirements', async () => {
    const { client } = fakeSupabase({
      organizations: { data: { call_scoped_requirements: true }, error: null },
      project_positions: {
        data: [
          { id: 'a1', scope_mode: 'all', requirement_id: null, position_services: [] },
          { id: 'hand-1', scope_mode: 'selected', requirement_id: 'req-1', position_services: [{ service_id: LOAD_IN }] },
          { id: 'stray', scope_mode: 'all', requirement_id: null, position_services: [{ service_id: STRIKE }] },
        ],
        error: null,
      },
      requirements: {
        data: [{ id: 'req-1', project_id: 'proj-1', instrument_id: ROLE, quantity: 8, default_pay: '200.00', notes: null, status: 'open' }],
        error: null,
      },
    })
    expect(await getCallScopeView(client, 'org-1', ['proj-1'])).toEqual({
      chairs: {
        a1: { scopeMode: 'all', serviceIds: [], requirementId: null },
        'hand-1': { scopeMode: 'selected', serviceIds: [LOAD_IN], requirementId: 'req-1' },
        stray: { scopeMode: 'all', serviceIds: [], requirementId: null },
      },
      requirements: [{ id: 'req-1', project_id: 'proj-1', instrument_id: ROLE, quantity: 8, default_pay: 200, notes: null, status: 'open' }],
    })
  })

  it("reads only the gigs on the page, every page of rows: a chair past PostgREST's 1000-row cut is still there", async () => {
    const chairRow = (n: number) => ({ id: `c${n}`, scope_mode: 'selected', requirement_id: 'req-1', position_services: [{ service_id: LOAD_IN }] })
    const all = Array.from({ length: 1005 }, (_, n) => chairRow(n))
    const { client, log } = fakeSupabase({
      organizations: { data: { call_scoped_requirements: true }, error: null },
      project_positions: (r) => ({ data: all.slice(r.range![0], r.range![1] + 1), error: null }),
      requirements: { data: [], error: null },
    })
    const view = await getCallScopeView(client, 'org-1', ['proj-1', 'proj-2'])
    expect(Object.keys(view!.chairs)).toHaveLength(1005)
    expect(view!.chairs.c1004).toEqual({ scopeMode: 'selected', serviceIds: [LOAD_IN], requirementId: 'req-1' })
    const chairReads = log.filter((r) => r.table === 'project_positions')
    expect(chairReads.map((r) => r.range)).toEqual([[0, 999], [1000, 1999]])
    expect(chairReads.every((r) => r.in?.join() === 'proj-1,proj-2')).toBe(true)
  })

  it('many gigs: asked about in groups of 100, and requirements come back in the order they were made', async () => {
    const ids = Array.from({ length: 250 }, (_, n) => `proj-${n}`)
    const req = (id: string, project: string, at: string) => ({
      id, project_id: project, instrument_id: ROLE, quantity: 1, default_pay: null, notes: null, status: 'open', created_at: at,
    })
    const { client, log } = fakeSupabase({
      organizations: { data: { call_scoped_requirements: true }, error: null },
      project_positions: { data: [], error: null },
      requirements: (r) => ({
        data: r.in![0] === 'proj-0'
          ? [req('req-b', 'proj-0', '2026-10-02T10:00:00+00:00')]
          : r.in![0] === 'proj-100'
            ? [req('req-a', 'proj-100', '2026-10-01T10:00:00+00:00')]
            : [],
        error: null,
      }),
    })
    const view = await getCallScopeView(client, 'org-1', ids)
    expect(log.filter((r) => r.table === 'requirements').map((r) => r.in!.length)).toEqual([100, 100, 50])
    expect(view!.requirements.map((r) => r.id)).toEqual(['req-a', 'req-b'])
  })

  it('switch on, no gigs: an empty view, and no chair or requirement read', async () => {
    const { client, reads } = fakeSupabase({ organizations: { data: { call_scoped_requirements: true }, error: null } })
    expect(await getCallScopeView(client, 'org-1', [])).toEqual({ chairs: {}, requirements: [] })
    expect(reads).toEqual(['organizations'])
  })

  it('reads back into servicesFor exactly', () => {
    expect(chairScopeForServicesFor({ scopeMode: 'selected', serviceIds: [LOAD_IN], requirementId: null })).toEqual({
      scope_mode: 'selected',
      position_services: [{ service_id: LOAD_IN }],
    })
    expect(chairScopeForServicesFor(undefined)).toBeNull()
  })
})

describe('a chair the view does not have: its calls are unknown, never every call', () => {
  const services = [
    { id: LOAD_IN, start_time: '2026-11-01T14:00:00Z', base_pay: 100 },
    { id: STRIKE, start_time: '2026-11-01T23:00:00Z', base_pay: 50 },
  ]
  const view = {
    chairs: {
      every: { scopeMode: 'all' as const, serviceIds: [], requirementId: null },
      strike: { scopeMode: 'selected' as const, serviceIds: [STRIKE], requirementId: 'req-1' },
      none: { scopeMode: 'selected' as const, serviceIds: [], requirementId: null },
    },
    requirements: [],
  }

  it('without a view (switch off): the same services array, so nothing changes', () => {
    expect(callScopeChairServices(null, 'anything', services)).toBe(services)
  })

  it("with a view: the chair's calls, or null for a chair it does not have", () => {
    expect(callScopeChairServices(view, 'every', services)).toBe(services)
    expect(callScopeChairServices(view, 'strike', services)!.map((s) => s.id)).toEqual([STRIKE])
    expect(callScopeChairServices(view, 'missing', services)).toBeNull()
  })

  it("Text from my phone: a chair's own first call, no date for no calls or unknown ones, else the gig's", () => {
    const byChair = chairFirstCalls([{ id: 'every' }, { id: 'strike' }, { id: 'none' }, { id: 'missing' }], services, view)
    expect(byChair).toEqual({ strike: '2026-11-01T23:00:00Z', none: null, missing: null })
    const gig = '2026-11-01T14:00:00Z'
    expect(startsAtForChair(byChair, 'strike', gig)).toBe('2026-11-01T23:00:00Z')
    expect(startsAtForChair(byChair, 'none', gig)).toBeNull()
    expect(startsAtForChair(byChair, 'missing', gig)).toBeNull()
    expect(startsAtForChair(byChair, 'every', gig)).toBe(gig)
    expect(startsAtForChair(undefined, 'every', gig)).toBe(gig)
    expect(startsAtForChair(undefined, 'every', undefined)).toBeNull()
  })
})

describe('fulfilment is derived from the chairs', () => {
  const req = { id: 'req-1', quantity: 3, status: 'open' }
  const chairs = (...statuses: string[]) => statuses.map((status) => ({ requirement_id: 'req-1', status }))

  it('open until as many chairs are confirmed as it asked for', () => {
    expect(requirementFulfilment(req, chairs('confirmed', 'offered', 'vacant'))).toEqual({ quantity: 3, chairs: 3, confirmed: 1, offered: 1, needed: 2, state: 'open' })
    expect(requirementFulfilment(req, chairs('confirmed', 'confirmed', 'confirmed')).state).toBe('filled')
  })

  it('a removed chair is not counted as filled', () => {
    expect(requirementFulfilment(req, chairs('confirmed', 'confirmed'))).toMatchObject({ chairs: 2, needed: 1, state: 'open' })
  })

  it('ignores other chairs and keeps cancelled', () => {
    const mixed = [...chairs('confirmed'), { requirement_id: null, status: 'confirmed' }, { requirement_id: 'req-2', status: 'confirmed' }]
    expect(requirementFulfilment(req, mixed).confirmed).toBe(1)
    expect(requirementFulfilment({ ...req, status: 'cancelled' }, chairs('confirmed', 'confirmed', 'confirmed')).state).toBe('cancelled')
  })
})

describe('staffing alert lines', () => {
  const calls = [
    { id: LOAD_IN, name: 'Load-in' },
    { id: STRIKE, name: 'Strike' },
  ]
  const scoped = (id: string, serviceId: string) => ({ id, scope_mode: 'selected', position_services: [{ service_id: serviceId }] })

  it('a chair with no requirement is not grouped (the line is exactly as before)', () => {
    expect(alertGroupFor({ id: 'v1' }, 'Violin 1', undefined, calls)).toBeUndefined()
  })

  it('two requirements for one role stay two lines, each named by its calls', () => {
    const a = alertGroupFor(scoped('h1', LOAD_IN), 'Stagehand', { id: 'req-in', quantity: 8 }, calls)
    const b = alertGroupFor(scoped('h9', STRIKE), 'Stagehand', { id: 'req-out', quantity: 4 }, calls)
    expect(a).toEqual({ key: 'requirement:req-in', label: 'Stagehand (Load-in)', quantity: 8 })
    expect(b).toEqual({ key: 'requirement:req-out', label: 'Stagehand (Strike)', quantity: 4 })
  })

  it('a requirement on every call is named by its role alone', () => {
    expect(alertGroupFor({ id: 'a1', scope_mode: 'all' }, 'A1', { id: 'req-a1', quantity: 1 }, calls)).toEqual({ key: 'requirement:req-a1', label: 'A1', quantity: 1 })
  })
})

describe('the routes only read the request', () => {
  const post = (body: unknown) =>
    requirementsPOST(new NextRequest('http://localhost/api/projects/proj-1/requirements', { method: 'POST', body: JSON.stringify(body) }), {
      params: Promise.resolve({ projectId: 'proj-1' }),
    })
  const put = (body: unknown) =>
    scopePUT(new NextRequest('http://localhost/api/positions/pos-1/scope', { method: 'PUT', body: JSON.stringify(body) }), {
      params: Promise.resolve({ positionId: 'pos-1' }),
    })
  const good = { instrumentId: ROLE, quantity: 2, serviceIds: null, requestId: REQ_KEY }

  it('POST requirements: not an admin -> their answer, nothing called', async () => {
    state.admin = { user: null, error: NextResponse.json({ error: 'Permission denied' }, { status: 403 }) }
    expect((await post(good)).status).toBe(403)
    expect(state.rpc).not.toHaveBeenCalled()
  })

  it('POST requirements: a bad request -> 400, nothing called', async () => {
    const res = await post({ ...good, quantity: 0 })
    expect(res.status).toBe(400)
    expect(state.rpc).not.toHaveBeenCalled()
  })

  it('POST requirements: made', async () => {
    state.rpc.mockResolvedValue({ data: { result: 'created', requirement: { id: 'req-1' }, position_ids: ['p1', 'p2'] }, error: null })
    const res = await post(good)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, created: true, requirement: { id: 'req-1' }, positionIds: ['p1', 'p2'] })
    expect(state.rpc.mock.calls[0][1]).toMatchObject({ p_project_id: 'proj-1', p_created_by: 'user-admin', p_service_ids: null })
  })

  it('POST requirements: refused -> its status and code', async () => {
    state.rpc.mockResolvedValue({ data: { result: 'not_enabled' }, error: null })
    const res = await post(good)
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'not_enabled' })
  })

  it('PUT scope: updated, and a missing body is refused', async () => {
    state.rpc.mockResolvedValue({ data: { result: 'updated' }, error: null })
    const res = await put({ serviceIds: [STRIKE] })
    expect(await res.json()).toEqual({ success: true, changed: true })
    expect((await put({})).status).toBe(400)
  })

  it('PUT scope: someone holds the chair -> 409', async () => {
    state.rpc.mockResolvedValue({ data: { result: 'chair_in_use' }, error: null })
    expect((await put({ serviceIds: null })).status).toBe(409)
  })
})
