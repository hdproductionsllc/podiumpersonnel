# Lessons Learned

## Resend Rate Limit: Always delay between email sends
**Date:** 2026-02-10
**Bug:** "1 failed" when sending music reminders to 3 musicians. Third email hit Resend's 2 requests/second rate limit.
**Root cause:** Sending emails in a tight `for` loop with no delay between iterations.
**Fix:** Add `if (i > 0) await new Promise((r) => setTimeout(r, 600))` at the start of every email-sending loop.
**Rule:** ANY time you write a loop that sends emails via Resend, add a 600ms delay between sends. No exceptions. This applies to all API routes — sends, reminders, cron jobs, invitations, etc.

## logEmail() can throw — don't let it kill the count
**Date:** 2026-02-10
**Bug:** Email sent successfully but counted as "failed" because `logEmail()` threw and `sentCount++` was after it in the same try block.
**Fix:** Always increment `sentCount` immediately after the email send succeeds. Wrap `logEmail()` in its own try/catch so a logging failure doesn't affect the send count.
**Rule:** In send loops: `sendEmail()` → `sentCount++` → `try { logEmail() } catch {}`. Never put sentCount after logEmail.

## Musicians aren't org members — use serviceClient for their queries
**Date:** 2026-02-10
**Bug:** Musician portal showed "No music shared yet" even though files were uploaded. RLS policies on `project_files` require `organization_members` membership, but musicians aren't org members.
**Fix:** Use `createServiceClient()` (bypasses RLS) instead of `createClient()` for all musician portal API queries that touch org-owned tables (project_files, project_positions, etc.).
**Rule:** Any API route under `/api/musician/` that reads org data must use serviceClient. Musicians only exist in the `musicians` table, not `organization_members`.
