import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { sendEmail } from '@/lib/email/send'

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
 * Render a thrown value for an ops alert.
 *
 * `String(error)` is only useful for an Error. The failures these jobs actually
 * hit come from Supabase, and a PostgREST failure is a plain object —
 * `{ message, details, hint, code }` — so `String()` rendered it "[object
 * Object]" and every alert email named a job but no cause. Four alerts could
 * arrive saying nothing beyond "expire-offers failed".
 *
 * Prefer the named PostgREST fields, which are the diagnosis; fall back to JSON
 * for any other object, guarded because a circular value would otherwise throw
 * inside the alert and lose the failure entirely.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message}\n\n${error.stack ?? ''}`
  }

  if (error !== null && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const named = ['message', 'code', 'details', 'hint']
      .filter((key) => record[key] != null && record[key] !== '')
      .map((key) => `${key}: ${String(record[key])}`)

    if (named.length > 0) return named.join('\n')

    try {
      return JSON.stringify(error, null, 2)
    } catch {
      return String(error)
    }
  }

  return String(error)
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
      html: `<p>The scheduled job <strong>${jobName}</strong> failed:</p><pre>${detail}</pre>`,
    })
  } catch (e) {
    console.error(`notifyOps failed for ${jobName}:`, e)
  }
}
