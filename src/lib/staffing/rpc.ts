/**
 * The staffing database functions (migration 094): claim_chair and
 * create_offer. Both are called with the service role only.
 *
 * Before 094 is pasted they do not exist. The callers then refuse the action
 * (fail closed) rather than fall back to the old multi-step writes: the whole
 * point of the functions is that a chair is decided in one transaction, and a
 * fallback would quietly bring back the races they remove. The refusal is
 * logged with this message so it is obvious in the Vercel logs what to do.
 */
export const MIGRATION_094_MISSING =
  'database function missing: migration 094 (scripts/sql/094-cascade-constraints.paste.sql) has not been applied'

/** PostgREST "function not found in schema cache", or Postgres "undefined function". */
export function isMissingFunction(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === 'PGRST202' || code === '42883'
}
