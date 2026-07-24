import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

/**
 * Guards the SQL migrations against RLS policies that are accidentally public.
 *
 * The bug this exists to prevent (migration 039, fixed in 076): a policy written
 * as a "service role bypass"
 *
 *   CREATE POLICY "Service role full access to X"
 *     ON X FOR ALL USING (true) WITH CHECK (true);
 *
 * has no TO clause, so Postgres applies it to PUBLIC — every role, `anon`
 * included. Supabase grants `anon` privileges on the public schema by default
 * and relies on RLS as the gate, so USING (true) hands the whole table to
 * anyone holding the anon key, which ships in the browser bundle.
 *
 * Such a policy is also unnecessary: the service role bypasses RLS outright.
 *
 * These tests parse the migration SQL rather than talk to a database, so they
 * run in CI with no credentials.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

type Policy = {
  file: string
  name: string
  table: string
  command: string
  usingExpr: string | null
  /** INSERT policies scope via WITH CHECK rather than USING. */
  withCheckExpr: string | null
  hasToClause: boolean
  raw: string
}

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

/**
 * Replay the migrations in filename order and return the policies that are
 * still live at the end.
 *
 * Replaying rather than just collecting CREATE statements is the whole point: a
 * policy that a later migration DROPs is not a finding, and a policy that is
 * dropped and recreated must be judged by its final definition. Keyed by
 * (table, policy name), which is what Postgres treats as unique.
 */
function livePolicies(): Policy[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const live = new Map<string, Policy>()
  const key = (table: string, name: string) => `${table.toLowerCase()}::${name}`

  for (const file of files) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))

    // Statements are terminated by ';'. Good enough here: no policy body in this
    // repo contains a semicolon inside a string literal.
    for (const statement of sql.split(';')) {
      const dropped = statement.match(
        /DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?"([^"]+)"\s+ON\s+([A-Za-z0-9_.]+)/i
      )
      if (dropped) {
        live.delete(key(dropped[2], dropped[1]))
        continue
      }

      const created = statement.match(
        /CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+([A-Za-z0-9_.]+)([\s\S]*)/i
      )
      if (!created) continue

      const [, name, table, rest] = created
      const commandMatch = rest.match(/\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b/i)
      const usingMatch = rest.match(/\bUSING\s*\(([\s\S]*?)\)\s*(?:WITH\s+CHECK|$)/i)
      const withCheckMatch = rest.match(/\bWITH\s+CHECK\s*\(([\s\S]*)\)\s*$/i)

      live.set(key(table, name), {
        file,
        name,
        table,
        command: (commandMatch?.[1] ?? 'ALL').toUpperCase(),
        usingExpr: usingMatch ? usingMatch[1].trim() : null,
        withCheckExpr: withCheckMatch ? withCheckMatch[1].trim() : null,
        // A TO clause restricts which roles the policy applies to. Without one,
        // it applies to PUBLIC.
        hasToClause: /\bTO\s+(service_role|authenticated|anon|public)\b/i.test(rest),
        raw: statement.trim(),
      })
    }
  }

  return [...live.values()]
}

/** Policies whose USING expression is an unconditional truth. */
function isUnconditional(expr: string | null): boolean {
  if (expr === null) return false
  return /^true$/i.test(expr.trim())
}

describe('RLS policy safety (migrations)', () => {
  const policies = livePolicies()

  it('parses policies out of the migrations', () => {
    // Sanity check on the parser itself — if this drops to zero the rest of the
    // suite would pass vacuously.
    expect(policies.length).toBeGreaterThan(20)
  })

  it('actually drops the two public gig-detail policies from 039', () => {
    // Proves the replay sees the DROPs in 076 rather than the test passing
    // because the parser silently stopped finding anything.
    const names = policies.map((p) => p.name)
    expect(names).not.toContain('Service role full access to gig_detail_sends')
    expect(names).not.toContain('Service role full access to gig_detail_confirmations')
  })

  it('has no USING (true) policy that applies to every role', () => {
    // A policy that is both unconditional AND unrestricted by role is open to
    // `anon`. Either narrow the USING expression or add an explicit TO clause.
    const offenders = policies
      .filter((p) => isUnconditional(p.usingExpr) && !p.hasToClause)
      // zip_coordinates is a public, non-tenant reference table (US ZIP → lat/lng).
      // It holds no customer data and is intentionally world-readable.
      .filter((p) => p.table !== 'zip_coordinates')

    expect(
      offenders.map((p) => `${p.file}: "${p.name}" on ${p.table} FOR ${p.command}`)
    ).toEqual([])
  })

  it('never grants unconditional write access to a tenant table', () => {
    // Stricter than the rule above: FOR ALL / INSERT / UPDATE / DELETE with an
    // unconditional USING is a write hole regardless of intent.
    const writeCommands = ['ALL', 'INSERT', 'UPDATE', 'DELETE']
    const offenders = policies.filter(
      (p) =>
        writeCommands.includes(p.command) &&
        isUnconditional(p.usingExpr) &&
        !p.hasToClause &&
        p.table !== 'zip_coordinates'
    )

    expect(offenders.map((p) => `${p.file}: "${p.name}" on ${p.table}`)).toEqual([])
  })

  it('does not reintroduce the token-shaped public policy from schema.sql', () => {
    // The original contract_offers policies were USING (token IS NOT NULL) —
    // which never compares the token to anything, so it matches every row.
    // Migration 019 dropped them; this keeps the shape from coming back.
    const offenders = policies.filter(
      (p) => p.usingExpr !== null && /^\s*token\s+IS\s+NOT\s+NULL\s*$/i.test(p.usingExpr)
    )

    expect(offenders.map((p) => `${p.file}: "${p.name}" on ${p.table}`)).toEqual([])
  })

  it('keeps the gig-detail tables free of public policies (regression: 039 → 076)', () => {
    const gigDetailTables = ['gig_detail_sends', 'gig_detail_confirmations']

    // Every surviving policy on these tables must be scoped — either by an
    // organization_id / send_id predicate or by an explicit role.
    const live = policies.filter((p) => gigDetailTables.includes(p.table))

    for (const policy of live) {
      // INSERT policies carry their predicate in WITH CHECK, so consider both.
      const predicate = `${policy.usingExpr ?? ''} ${policy.withCheckExpr ?? ''}`
      const scoped =
        policy.hasToClause || /organization_id|send_id|auth\.uid\(\)/i.test(predicate)

      expect(
        scoped,
        `${policy.file}: policy "${policy.name}" on ${policy.table} is not scoped to an org or role`
      ).toBe(true)
    }
  })
})
