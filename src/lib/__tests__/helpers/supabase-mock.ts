/**
 * Minimal chainable Supabase client fake for behavioral route tests.
 *
 * Scope: only the query-builder surface the offer-lifecycle routes actually
 * use — from / select / update / insert / eq / neq / in / is / not / lt /
 * limit / single / maybeSingle, plus `select('*', { count: 'exact', head: true })`.
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
 */

export type Row = Record<string, any>

export interface AppliedFilter {
  method: string
  args: unknown[]
}

export interface QueryLogEntry {
  table: string
  operation: 'select' | 'update' | 'insert'
  filters: AppliedFilter[]
  payload?: unknown
  count: boolean
}

export interface MockResult {
  data: any
  error: { message: string; code?: string } | null
  count?: number | null
}

export class MockSupabaseDb {
  tables: Record<string, Row[]>
  log: QueryLogEntry[] = []
  /** Called with each operation's log entry before it executes (race hook). */
  beforeOp?: (entry: QueryLogEntry, db: MockSupabaseDb) => void

  constructor(tables: Record<string, Row[]> = {}) {
    this.tables = tables
  }

  from(table: string): MockQueryBuilder {
    return new MockQueryBuilder(this, table)
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

  constructor(
    private db: MockSupabaseDb,
    private table: string
  ) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }): this {
    if (options?.count) this.wantCount = true
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
        case 'lt':
          return !isNullish(row[col]) && (row[col] as any) < (args[1] as any)
        default:
          throw new Error(`MockSupabaseDb: unsupported filter "${method}"`)
      }
    })
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
      rows.push(...toInsert.map((r) => ({ ...r })))
      return { data: null, error: null }
    }

    let matched = rows.filter((r) => this.rowMatches(r))
    if (this.operation === 'update') {
      for (const row of matched) Object.assign(row, this.payload as Row)
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
