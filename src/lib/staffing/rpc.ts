/**
 * The staffing database functions (migration 094): claim_chair and
 * create_offer. Both are called with the service role only.
 *
 * 094 is pasted before this code deploys. If it is not, the functions do not
 * exist and the callers refuse the action (fail closed) rather than fall back
 * to the old multi-step writes: the whole point of the functions is that a
 * chair is decided in one transaction, and a fallback would quietly bring back
 * the races they remove. The refusal is logged with this message so it is
 * obvious in the Vercel logs what to do.
 *
 * (The one-offer-per-chair indexes are migration 095, pasted after this code
 * is live. Nothing here needs them: the functions keep those rules
 * themselves, and the indexes are a backstop.)
 */
export const MIGRATION_094_MISSING =
  'database function missing: migration 094 (scripts/sql/094-cascade-constraints.paste.sql) has not been applied'

/**
 * True when `fn` itself is missing: PostgREST "function not found in schema
 * cache" (PGRST202), or Postgres "undefined function" (42883) naming it. A
 * 42883 from something `fn` calls (say log_staffing_event, if 092 were gone)
 * is a different fault, and is not reported as "094 not applied".
 */
export function isMissingFunction(error: unknown, fn: string): boolean {
  const e = error as { code?: string; message?: string } | null
  if (e?.code !== 'PGRST202' && e?.code !== '42883') return false
  // The message names the missing function; where it was called from is in
  // `context`/`hint`, not here.
  return new RegExp(`\\b${fn}\\b`).test(e.message ?? '')
}

/** PostgREST "column not in schema cache" (PGRST204), or Postgres "undefined column" (42703). */
export function isMissingColumn(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === 'PGRST204' || code === '42703'
}
