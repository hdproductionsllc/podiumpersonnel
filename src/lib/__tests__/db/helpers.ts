import { randomUUID } from 'crypto'
import { Client } from 'pg'

/**
 * Helpers for the database tests. Everything here is synthetic: random ids,
 * example.test addresses, a throwaway database. Never point DB_TEST_URL at a
 * real Supabase project.
 */

export function connectionUrl(): string {
  const url = process.env.DB_TEST_URL
  if (!url) throw new Error('DB_TEST_URL is not set (see docs/database-tests.md)')
  return url
}

/** A superuser connection: bypasses RLS, used to set up and inspect data. */
export async function adminClient(): Promise<Client> {
  const client = new Client({ connectionString: connectionUrl() })
  await client.connect()
  return client
}

type Query = (sql: string, params?: unknown[]) => Promise<{ rowCount: number | null; rows: Record<string, unknown>[] }>

/**
 * Run `fn` the way PostgREST would for a signed-in user: role "authenticated"
 * with the JWT claims Supabase's auth.uid() reads. Always rolled back, so a
 * test's writes never leak into the next one.
 */
export async function asUser<T>(client: Client, userId: string, fn: (q: Query) => Promise<T>): Promise<T> {
  await client.query('begin')
  try {
    await client.query('set local role authenticated')
    const claims = JSON.stringify({ sub: userId, role: 'authenticated' })
    await client.query("select set_config('request.jwt.claims', $1, true)", [claims])
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId])
    return await fn((sql, params) => client.query(sql, params))
  } finally {
    await client.query('rollback')
  }
}

/** Same as asUser, for the anonymous (not signed in) role. */
export async function asAnon<T>(client: Client, fn: (q: Query) => Promise<T>): Promise<T> {
  await client.query('begin')
  try {
    await client.query('set local role anon')
    return await fn((sql, params) => client.query(sql, params))
  } finally {
    await client.query('rollback')
  }
}

export interface Tenant {
  orgId: string
  adminUserId: string
  musicianId: string
  projectId: string
  serviceId: string
  positionId: string
  offerId: string
  paymentId: string
}

/** One organization with an admin and one of each tenant-owned row. */
export async function createTenant(db: Client, label: string): Promise<Tenant> {
  const t: Tenant = {
    orgId: randomUUID(),
    adminUserId: randomUUID(),
    musicianId: randomUUID(),
    projectId: randomUUID(),
    serviceId: randomUUID(),
    positionId: randomUUID(),
    offerId: randomUUID(),
    paymentId: randomUUID(),
  }
  const instrumentId = randomUUID()

  await db.query('insert into auth.users (id, email) values ($1, $2)', [
    t.adminUserId,
    `admin-${label}-${t.adminUserId}@example.test`,
  ])
  await db.query('insert into organizations (id, name, slug) values ($1, $2, $3)', [
    t.orgId,
    `Org ${label}`,
    `org-${label}-${t.orgId}`,
  ])
  await db.query(
    "insert into organization_members (organization_id, user_id, role) values ($1, $2, 'admin')",
    [t.orgId, t.adminUserId]
  )
  await db.query('insert into instruments (id, organization_id, name) values ($1, $2, $3)', [
    instrumentId,
    t.orgId,
    'Violin',
  ])
  await db.query(
    'insert into musicians (id, organization_id, first_name, last_name, email) values ($1, $2, $3, $4, $5)',
    [t.musicianId, t.orgId, 'Test', `Musician ${label}`, `musician-${label}-${t.musicianId}@example.test`]
  )
  await db.query('insert into projects (id, organization_id, name) values ($1, $2, $3)', [
    t.projectId,
    t.orgId,
    `Project ${label}`,
  ])
  await db.query(
    "insert into services (id, project_id, name, service_type, start_time) values ($1, $2, 'Ceremony', 'performance', now())",
    [t.serviceId, t.projectId]
  )
  await db.query(
    'insert into project_positions (id, project_id, instrument_id, chair_number) values ($1, $2, $3, 1)',
    [t.positionId, t.projectId, instrumentId]
  )
  await db.query(
    'insert into contract_offers (id, project_position_id, musician_id) values ($1, $2, $3)',
    [t.offerId, t.positionId, t.musicianId]
  )
  await db.query(
    'insert into payments (id, organization_id, service_id, musician_id, amount) values ($1, $2, $3, $4, 100)',
    [t.paymentId, t.orgId, t.serviceId, t.musicianId]
  )
  return t
}
