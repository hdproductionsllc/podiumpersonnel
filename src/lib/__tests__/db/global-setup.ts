import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { Client } from 'pg'

/**
 * Replays supabase/migrations/*.sql, in filename order, into the Postgres that
 * DB_TEST_URL points at. Connect as a superuser (supabase_admin in the
 * supabase/postgres image; its "postgres" role is not one).
 *
 * The target must be a FRESH Supabase Postgres. If the app schema is already
 * there the replay is skipped, so a second local run reuses the first one's
 * database; throw the container away to start clean.
 *
 * Fails with the migration's file name and Postgres's error text. The data is
 * synthetic, but this repo is public, so nothing else is printed.
 */
const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

export default async function setup() {
  const url = process.env.DB_TEST_URL
  if (!url) {
    throw new Error(
      'DB_TEST_URL is not set. Point it at a throwaway supabase/postgres container, e.g. ' +
        'postgresql://supabase_admin:postgres@localhost:54329/postgres (docs/database-tests.md).'
    )
  }

  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const { rows } = await client.query("select to_regclass('public.organizations') as t")
    if (rows[0].t) {
      console.log('[db tests] app schema already present, skipping migration replay')
      return
    }

    // The image has no storage schema (the Storage service creates it in a real project).
    const storage = await client.query("select to_regclass('storage.buckets') as t")
    if (!storage.rows[0].t) {
      await client.query(readFileSync(join(__dirname, 'storage-stub.sql'), 'utf8'))
    }

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort()
    for (const file of files) {
      try {
        await client.query(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
      } catch (err) {
        const e = err as { message?: string; position?: string }
        throw new Error(
          `migration ${file} failed: ${e.message}${e.position ? ` (at character ${e.position})` : ''}`
        )
      }
    }
    console.log(`[db tests] replayed ${files.length} migrations`)
  } finally {
    await client.end()
  }
}
