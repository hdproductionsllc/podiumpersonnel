/**
 * Minimal chainable Supabase client fake for behavioral route tests.
 *
 * Scope: only the query-builder surface the offer-lifecycle routes actually
 * use — from / select / update / insert / delete / eq / neq / in / is / not /
 * lt / gte / lte / ilike / order / limit / single / maybeSingle, plus `select('*', { count: 'exact', head: true })`.
 * Unknown filter operators throw loudly rather than silently matching.
 *
 * Behavior is driven by a plain in-memory table map: filters are applied to
 * the seeded rows, updates mutate matching rows in place, and every executed
 * operation is recorded in `db.log` so tests can assert both the resulting
 * row state AND which filters an operation carried (e.g. that an update was
 * optimistically locked with .in('status', ['pending', 'viewed'])). An update
 * that matches zero rows returns `data: []` exactly like PostgREST, which is
 * what lets the race-condition paths in the routes be exercised for real.
 *
 * PostgREST embeds (nested `select` strings) are NOT interpreted: a query
 * returns whole row objects as seeded, so tests seed rows that already carry
 * the nested shapes a route expects (offer.musician, offer.project_position, …).
 * Updates merge scalar patches into the row, leaving nested seeds untouched.
 *
 * Wiring (per test file — vi.mock factories are hoisted, so route down a
 * vi.hoisted holder):
 *
 *   const state = vi.hoisted(() => ({ db: undefined as any }))
 *   vi.mock('@/lib/supabase/server', () => ({
 *     createServiceClient: () => state.db,
 *     getOrgAdminEmails: vi.fn(async () => ['admin@example.com']),
 *   }))
 *   beforeEach(() => { state.db = new MockSupabaseDb({ contract_offers: [...] }) })
 *
 * Races: assign `db.beforeOp` to mutate rows the moment a specific operation
 * begins — e.g. flip an offer's status during the mid-request substitution
 * lookup to simulate a concurrent accept/decline landing between the route's
 * initial fetch and its guarded update.
 *
 * Database functions: `db.rpc(name, args)` runs `db.rpcs[name]` inside
 * `db.transaction()`. By default those are the in-memory claim_chair and
 * create_offer (helpers/staffing-rpcs.ts); delete one to act as if migration
 * 094 were not applied (PostgREST's PGRST202), or replace it to inject a
 * failure.
 */

import { MockPgError, STAFFING_RPCS } from './staffing-rpcs'

export type Row = Record<string, any>

export interface AppliedFilter {
  method: string
  args: unknown[]
}

export interface QueryLogEntry {
  table: string
  operation: 'select' | 'update' | 'insert' | 'delete' | 'rpc'
  filters: AppliedFilter[]
  payload?: unknown
  count: boolean
}

export interface MockResult {
  data: any
  error: { message: string; code?: string } | null
  count?: number | null
}

/** A database function: reads and writes db.tables, throws MockPgError to refuse. */
export type MockRpc = (db: MockSupabaseDb, args: never) => unknown

export class MockSupabaseDb {
  tables: Record<string, Row[]>
  log: QueryLogEntry[] = []
  /** Called with each operation's log entry before it executes (race hook). */
  beforeOp?: (entry: QueryLogEntry, db: MockSupabaseDb) => void
  /**
   * A unique index: return an error to refuse a row an insert or update would
   * write (`others` is the rest of the table). The whole operation is refused,
   * as Postgres would.
   */
  constraint?: (table: string, candidate: Row, others: Row[]) => { message: string; code: string } | null

  /** Database functions by name (see the header). */
  rpcs: Record<string, MockRpc> = { ...STAFFING_RPCS }

  constructor(tables: Record<string, Row[]> = {}) {
    this.tables = tables
  }

  from(table: string): MockQueryBuilder {
    return new MockQueryBuilder(this, table)
  }

  /** supabase.rpc(): logged as operation 'rpc' under the function's name. */
  async rpc(name: string, args: Record<string, unknown> = {}): Promise<MockResult> {
    const entry: QueryLogEntry = { table: name, operation: 'rpc', filters: [], payload: args, count: false }
    this.log.push(entry)
    this.beforeOp?.(entry, this)
    const fn = this.rpcs[name]
    if (!fn) {
      return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${name} in the schema cache` } }
    }
    try {
      return { data: this.transaction(() => fn(this, args as never)), error: null }
    } catch (err) {
      if (err instanceof MockPgError) return { data: null, error: { code: err.code, message: err.message } }
      throw err
    }
  }

  /**
   * Run `fn`; if it throws, put every table back as it was (rows keep their
   * identity, so references tests hold stay valid).
   */
  transaction<T>(fn: () => T): T {
    const saved = Object.entries(this.tables).map(([name, rows]) => ({
      name,
      array: rows,
      members: [...rows],
      values: rows.map((r) => ({ ...r })),
    }))
    const names = new Set(saved.map((t) => t.name))
    try {
      return fn()
    } catch (err) {
      for (const name of Object.keys(this.tables)) if (!names.has(name)) delete this.tables[name]
      for (const t of saved) {
        t.members.forEach((row, i) => {
          for (const key of Object.keys(row)) delete row[key]
          Object.assign(row, t.values[i])
        })
        t.array.splice(0, t.array.length, ...t.members)
        this.tables[t.name] = t.array
      }
      throw err
    }
  }

  /** Find a seeded row by id. */
  row(table: string, id: string): Row | undefined {
    return (this.tables[table] ?? []).find((r) => r.id === id)
  }

  /** Executed operations, optionally filtered by table and/or operation type. */
  ops(table?: string, operation?: QueryLogEntry['operation']): QueryLogEntry[] {
    return this.log.filter(
      (e) => (table === undefined || e.table === table) && (operation === undefined || e.operation === operation)
    )
  }
}

function isNullish(v: unknown): boolean {
  return v === null || v === undefined
}

class MockQueryBuilder implements PromiseLike<MockResult> {
  private filters: AppliedFilter[] = []
  private operation: QueryLogEntry['operation'] = 'select'
  private payload: unknown
  private wantCount = false
  private singleMode: 'single' | 'maybe' | null = null
  private limitCount: number | null = null
  private orderBy: { column: string; ascending: boolean }[] = []
  /** select() called after insert(): PostgREST returns the inserted rows. */
  private returning = false

  constructor(
    private db: MockSupabaseDb,
    private table: string
  ) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }): this {
    if (options?.count) this.wantCount = true
    if (this.operation === 'insert') this.returning = true
    return this
  }

  update(patch: Row): this {
    this.operation = 'update'
    this.payload = patch
    return this
  }

  insert(rows: Row | Row[]): this {
    this.operation = 'insert'
    this.payload = rows
    return this
  }

  delete(): this {
    this.operation = 'delete'
    return this
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ method: 'eq', args: [column, value] })
    return this
  }

  neq(column: string, value: unknown): this {
    this.filters.push({ method: 'neq', args: [column, value] })
    return this
  }

  in(column: string, values: unknown[]): this {
    this.filters.push({ method: 'in', args: [column, values] })
    return this
  }

  is(column: string, value: unknown): this {
    this.filters.push({ method: 'is', args: [column, value] })
    return this
  }

  not(column: string, operator: string, value: unknown): this {
    this.filters.push({ method: 'not', args: [column, operator, value] })
    return this
  }

  lt(column: string, value: unknown): this {
    this.filters.push({ method: 'lt', args: [column, value] })
    return this
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ method: 'gte', args: [column, value] })
    return this
  }

  lte(column: string, value: unknown): this {
    this.filters.push({ method: 'lte', args: [column, value] })
    return this
  }

  /** Case-insensitive match. Only wildcard-free patterns are supported (an email lookup, not a search). */
  ilike(column: string, value: string): this {
    if (value.includes('%') || value.includes('_')) {
      throw new Error(`MockSupabaseDb: ilike() wildcards are not supported ("${value}")`)
    }
    this.filters.push({ method: 'ilike', args: [column, value] })
    return this
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderBy.push({ column, ascending: options?.ascending ?? true })
    return this
  }

  limit(count: number): this {
    this.limitCount = count
    return this
  }

  single(): this {
    this.singleMode = 'single'
    return this
  }

  maybeSingle(): this {
    this.singleMode = 'maybe'
    return this
  }

  private rowMatches(row: Row): boolean {
    return this.filters.every(({ method, args }) => {
      const col = args[0] as string
      switch (method) {
        case 'eq':
          return row[col] === args[1]
        case 'neq':
          return row[col] !== args[1]
        case 'in':
          return (args[1] as unknown[]).includes(row[col])
        case 'is':
          return args[1] === null ? isNullish(row[col]) : row[col] === args[1]
        case 'not':
          if (args[1] === 'is' && args[2] === null) return !isNullish(row[col])
          throw new Error(`MockSupabaseDb: unsupported not() operator "${String(args[1])}"`)
        case 'ilike':
          return typeof row[col] === 'string' && row[col].toLowerCase() === String(args[1]).toLowerCase()
        case 'lt':
          return !isNullish(row[col]) && (row[col] as any) < (args[1] as any)
        // Compared as strings: callers use these for ISO dates, which sort as text.
        case 'gte':
          return !isNullish(row[col]) && String(row[col]) >= String(args[1])
        case 'lte':
          return !isNullish(row[col]) && String(row[col]) <= String(args[1])
        default:
          throw new Error(`MockSupabaseDb: unsupported filter "${method}"`)
      }
    })
  }

  /** The first constraint violation the would-be rows cause, checked one at a time. */
  private violation(candidates: Row[], rest: Row[]): { message: string; code: string } | null {
    if (!this.db.constraint) return null
    const seen = [...rest]
    for (const row of candidates) {
      const error = this.db.constraint(this.table, row, seen)
      if (error) return error
      seen.push(row)
    }
    return null
  }

  private execute(): MockResult {
    const entry: QueryLogEntry = {
      table: this.table,
      operation: this.operation,
      filters: [...this.filters],
      payload: this.payload,
      count: this.wantCount,
    }
    this.db.log.push(entry)
    this.db.beforeOp?.(entry, this.db)

    const rows = (this.db.tables[this.table] ??= [])

    if (this.operation === 'insert') {
      const toInsert = Array.isArray(this.payload) ? (this.payload as Row[]) : [this.payload as Row]
      const inserted = toInsert.map((r, i) => ({ id: `${this.table}-${rows.length + i + 1}`, ...r }))
      const violation = this.violation(inserted, rows)
      if (violation) return { data: null, error: violation }
      rows.push(...inserted)
      if (!this.returning) return { data: null, error: null }
      const copies = inserted.map((r) => ({ ...r }))
      return { data: this.singleMode ? copies[0] ?? null : copies, error: null }
    }

    if (this.operation === 'delete') {
      const keep = rows.filter((r) => !this.rowMatches(r))
      const removed = rows.length - keep.length
      rows.splice(0, rows.length, ...keep)
      return { data: null, error: null, count: removed }
    }

    let matched = rows.filter((r) => this.rowMatches(r))
    if (this.operation === 'update') {
      const violation = this.violation(
        matched.map((row) => ({ ...row, ...(this.payload as Row) })),
        rows.filter((row) => !matched.includes(row))
      )
      if (violation) return { data: null, error: violation }
      for (const row of matched) Object.assign(row, this.payload as Row)
    }
    if (this.orderBy.length > 0) {
      // Nulls sort last, as PostgREST does for ascending order.
      const compare = (a: Row, b: Row) => {
        for (const { column, ascending } of this.orderBy) {
          const x = a[column]
          const y = b[column]
          if (x === y) continue
          if (isNullish(x)) return 1
          if (isNullish(y)) return -1
          return (x < y ? -1 : 1) * (ascending ? 1 : -1)
        }
        return 0
      }
      matched = [...matched].sort(compare)
    }
    if (this.limitCount !== null) matched = matched.slice(0, this.limitCount)

    if (this.wantCount) return { data: null, error: null, count: matched.length }

    const copies = matched.map((r) => ({ ...r }))
    if (this.singleMode === 'single') {
      if (copies.length === 1) return { data: copies[0], error: null }
      return {
        data: null,
        error: { message: `Expected exactly one row, found ${copies.length}`, code: 'PGRST116' },
      }
    }
    if (this.singleMode === 'maybe') {
      if (copies.length <= 1) return { data: copies[0] ?? null, error: null }
      return {
        data: null,
        error: { message: `Expected at most one row, found ${copies.length}`, code: 'PGRST116' },
      }
    }
    return { data: copies, error: null }
  }

  then<TResult1 = MockResult, TResult2 = never>(
    onfulfilled?: ((value: MockResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return new Promise<MockResult>((resolve) => resolve(this.execute())).then(onfulfilled, onrejected)
  }
}
