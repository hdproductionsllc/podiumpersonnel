/**
 * The song planner's outbound-mail switch (082).
 *
 * The planner is the first feature that can email a CLIENT — a couple, not a
 * musician — and it has an unattended sender (the reminder cron). So it gets its
 * own gate on top of EMAIL_SAFE_MODE, and that gate is OFF by default.
 *
 * The polarity is the point. EMAIL_SAFE_MODE defaults to suppressing, and this
 * defaults to not sending: in both cases a missing or misspelled env var means
 * NO mail leaves, never a blast. Turning the planner on is a deliberate act:
 *
 *     SONG_PLANNER_EMAILS=true
 *
 * With it off the feature still works end to end — links are minted, clients
 * plan, lists submit and lock — but every send is skipped and the operator is
 * told to copy the link and send it themselves. Nothing fails silently: each
 * call site reports the switch rather than pretending a send happened.
 *
 * This is a belt on top of braces. Mail also passes EMAIL_SAFE_MODE's allowlist
 * (client.ts), and the reminder job additionally honours CRON_ENABLED.
 */

/** Explicit opt-in only. Anything unset, blank, or unrecognized means NO. */
export function plannerEmailsEnabled(): boolean {
  const value = process.env.SONG_PLANNER_EMAILS
  if (value == null || value.trim() === '') return false
  return ['true', '1', 'on', 'yes'].includes(value.trim().toLowerCase())
}

/** For logs: one consistent line wherever a send was skipped by the switch. */
export function plannerEmailSkipped(context: string, to: string): void {
  console.log(
    `[SONG PLANNER EMAILS OFF] ${context} → ${to} not sent (set SONG_PLANNER_EMAILS=true to enable)`
  )
}
