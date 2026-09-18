import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { sendEmail } from '@/lib/email/send'
import { serverError } from '@/lib/api-helpers'

/**
 * Defense-in-depth switch for scheduled jobs. Email safety is already enforced
 * at the send chokepoint (EMAIL_SAFE_MODE), but this lets us fully no-op the
 * cron jobs during testing so they don't mutate state automatically either.
 *
 * Defaults ENABLED when unset so production runs normally. Set CRON_ENABLED=false
 * (e.g. in a preview/testing environment) to make the jobs skip.
 */
export function isCronEnabled(): boolean {
  const v = process.env.CRON_ENABLED
  if (v == null || v.trim() === '') return true
  return !['false', '0', 'off', 'no'].includes(v.trim().toLowerCase())
}

/**
 * Authorize a scheduled-job request. Returns a 401 response to return early, or
 * null when the caller is legitimately Vercel Cron.
 *
 * Replaces the inline check each route used to do:
 *
 *   if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) return 401
 *
 * That form fails OPEN when CRON_SECRET is unset or blank: the template literal
 * collapses to the string "Bearer undefined", so anyone sending exactly that
 * header is let through. These routes email every musician with a pending offer,
 * so an open one is a mass-mail trigger for the whole database. A missing secret
 * must deny everything instead — misconfiguration should break the cron job, not
 * silently expose it.
 */
export function requireCronAuth(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET

  if (!secret || secret.trim() === '') {
    console.error('CRON_SECRET is not set — refusing to run the scheduled job.')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}

/**
 * If cron is disabled, returns a JSON response the route should return early.
 * Otherwise returns null and the job proceeds. Pass the job name for logging.
 */
export function cronDisabledResponse(jobName: string): NextResponse | null {
  if (isCronEnabled()) return null
  console.log(`[CRON DISABLED] ${jobName} skipped (CRON_ENABLED=false)`)
  return NextResponse.json({ skipped: true, reason: 'CRON_ENABLED=false' })
}

/**
 * Render any thrown/returned error into readable text for logs and alert email.
 *
 * supabase-js errors (gateway 5xx, network failures, PostgREST errors) are
 * plain objects, not `Error` instances — `String(error)` on one of those
 * yields the useless `[object Object]`. Pull out the fields that actually
 * carry the information instead.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message}\n\n${error.stack ?? ''}`
  }

  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>
    const lines: string[] = []
    if (e.message != null) lines.push(String(e.message))
    if (e.code != null) lines.push(`code: ${e.code}`)
    if (e.details != null) lines.push(`details: ${e.details}`)
    if (e.hint != null) lines.push(`hint: ${e.hint}`)
    if (e.status != null) lines.push(`status: ${e.status}`)
    if (lines.length > 0) return lines.join('\n')
    return JSON.stringify(error, null, 2)
  }

  return String(error)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Best-effort ops alert when a scheduled job fails fatally. Goes through the
 * normal email path so EMAIL_SAFE_MODE applies (allowlist PLATFORM_ADMIN_EMAIL
 * to receive these during testing). Never throws — alerting must not mask the
 * original failure.
 */
export async function notifyOps(jobName: string, error: unknown): Promise<void> {
  // Sentry first: it needs no env beyond the DSN and never throws.
  Sentry.captureException(error, { tags: { cron: jobName } })

  const to = process.env.PLATFORM_ADMIN_EMAIL
  if (!to) return
  const detail = describeError(error)
  try {
    await sendEmail({
      to,
      subject: `[Podium cron] ${jobName} failed`,
      html: `<p>The scheduled job <strong>${jobName}</strong> failed:</p><pre>${escapeHtml(detail)}</pre>`,
    })
  } catch (e) {
    console.error(`notifyOps failed for ${jobName}:`, e)
  }
}

/**
 * Job-level failure reporting, in ONE place instead of each route hand-rolling
 * `notifyOps(...); return NextResponse.json({ error }, { status: 500 })` at
 * every fatal fetch site (A8, 2026-09-18 hardening).
 *
 * Runs `fn`. Anything it throws — including a Supabase/PostgREST error object
 * a route deliberately `throw`s after a fatal `withCronRetry` failure — is
 * reported to ops twice, on purpose:
 *   - `notifyOps`: Sentry + a best-effort email to PLATFORM_ADMIN_EMAIL, so a
 *     human actually hears about a broken cron job, not just an APM dashboard.
 *   - `serverError`: the same generic-500 shape every other API route uses,
 *     so cron failures show up in Sentry with the same `context` tagging as
 *     the rest of the app and never leak raw Postgres/RLS text into the
 *     response body.
 *
 * A route that wants a per-recipient loop to keep going through partial
 * failures should NOT throw from inside the loop — count the failures and
 * return them in the 200 response instead. Only throw for a failure that
 * makes the whole run meaningless (the initial fetch failing, for example).
 */
export async function runCronJob(
  jobName: string,
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await fn()
  } catch (error) {
    await notifyOps(jobName, error)
    return serverError(`cron:${jobName}`, error)
  }
}

export interface CronRetryOptions {
  attempts?: number
  delayMs?: number
  /** Injectable sleep so tests can fake timers instead of actually waiting. */
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * True for failures that a moment later will not reproduce: the gateway
 * answered 5xx, or the connection never completed (status 0). Never true for
 * 4xx / PostgREST errors — those are real query errors and retrying just
 * repeats them.
 */
export function isTransientSupabaseFailure(result: { error: unknown; status?: number }): boolean {
  if (!result.error) return false
  const status = result.status
  if (status === 0) return true
  if (typeof status === 'number' && status >= 500 && status < 600) return true
  return false
}

/**
 * Run a Supabase query builder (or any thenable that resolves to
 * { error, status }) and re-run it on transient gateway failures. `make` must
 * build a FRESH builder each call — a supabase-js builder can only be awaited
 * once. Returns the last result unchanged (never throws on its own), so callers
 * keep their existing `if (error)` handling.
 *
 * Sizing comes from the 2026-09-14 production trace. The gateway no longer
 * answers instantly: each 504 costs 5-7s on the wire before it comes back, so
 * three attempts with 2s/4s pauses spanned 22s — and the fault outlasted it
 * twice in one night. Five attempts with 1/2/4/8s pauses cover roughly 45s of
 * wall clock, against a 300s function limit. The delays start SHORTER than
 * before on purpose: most blips clear on the second try, and the waiting is
 * now dominated by the calls themselves, not by the sleeps.
 */
export async function withCronRetry<T extends { error: unknown; status?: number }>(
  label: string,
  make: () => PromiseLike<T>,
  opts?: CronRetryOptions,
): Promise<T> {
  const attempts = opts?.attempts ?? 5
  const delayMs = opts?.delayMs ?? 1000
  const sleep = opts?.sleep ?? defaultSleep

  let result: T = await make()
  for (let attempt = 1; attempt < attempts; attempt++) {
    if (!isTransientSupabaseFailure(result)) return result

    const e = result.error as Record<string, unknown>
    const status = result.status
    const message = e?.message ?? 'unknown error'
    const wait = delayMs * 2 ** (attempt - 1)
    console.warn(
      `[cron retry] ${label}: attempt ${attempt} failed (${status} ${message}), retrying in ${wait}ms`,
    )
    await sleep(wait)
    result = await make()
  }

  return result
}
