# Hardening pass, September 2026

*Branch `hardening-2026-09`. Five commits, one PR. No feature was added or removed; no happy path changed.*

## Why

A staff-level review on 2026-09-01 found the core offer engine more stable than it felt, but that David only learned about bugs by tripping over them. Five gaps made paying strangers scary:

1. No error monitoring. A customer's failure would arrive as an email, or never.
2. 55 database writes whose failures were silently discarded, including all five Stripe subscription changes.
3. The Resend rate-limit workaround pasted into ten send loops.
4. Tests never ran automatically. Two were already failing on master.
5. A create-next-app README, so nobody but David could run or deploy it.

## What changed

**Email throttle in one place** (`src/lib/email/client.ts`). `awaitResendSlot()` reserves the next free 600ms slot; both send sites in `send.ts` call it. The ten copied sleeps are gone, and `resend-throttle.test.ts` fails the build if one comes back. `tasks/lessons.md` was rewritten: the old rule ("add the sleep to every loop") was the wrong lesson.

**Every write result is checked.** Server side, writes that *are* the request now return a 500 via `serverError()` instead of claiming success: vacating a chair, expiring rival offers before sending a new one, stamping a payments export, marking a pre-gig reminder sent. The Stripe webhook applies each change through one `applyOrgUpdate()` helper that, on failure, deletes the idempotency row and returns 500, so Stripe's retry is processed instead of acked as a duplicate. Side effects that run after the user's action is already committed (releasing a sibling offer after an accept, audit rows, `viewed_at` stamps, instrument auto-links) log loudly and continue, because failing the request would tell a musician their accept failed when it succeeded. Client dialogs stay open with an error instead of closing as if saved.

**Silent catches now speak.** Thirteen comment-only catch blocks warn with a context string. The one that hid a real failure (the waterfall next-candidate email in `project-offers.tsx`) now checks the response and toasts.

**Sentry, inert until configured.** `@sentry/nextjs` is wired through `src/instrumentation.ts`, `src/instrumentation-client.ts`, the two root `sentry.*.config.ts` files, both error boundaries, `serverError()` and `notifyOps()`. With `NEXT_PUBLIC_SENTRY_DSN` unset the SDK is disabled. Source-map upload only happens when `SENTRY_AUTH_TOKEN` is present.

**CI.** `.github/workflows/ci.yml` runs typecheck, lint and tests on every PR and push to master. Lint is advisory (712 pre-existing errors). The two failing tests were fixed: one asserted a Tailwind class order PR #14 had changed on purpose; one broke on CRLF line endings.

**Docs and hygiene.** Real README, PR template with the migration checkbox, `.gitignore` for the local music-prep folder and the 7MB PNG.

## Verification

- `npx tsc --noEmit` clean; `npx vitest run` 714/714 (707 before, plus the throttle tests and two webhook behaviour tests).
- `npm run build` succeeds with the Sentry wrapper and no DSN.
- No `setTimeout(…, 600)` outside the email client; no bare `await supabase.from(…)` writes under `src/`.

## David's one action

Create a free Sentry project, copy its DSN into Vercel as `NEXT_PUBLIC_SENTRY_DSN` (Production and Preview), redeploy. Optionally add `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` for readable stack traces.

## Second pass, when ready

- Generated Supabase `Database` types and typed clients. Needs `npx supabase login`; will surface a wave of compile errors (320 `any`s today) that are each a latent bug.
- Consolidate the 25 hand-rolled admin checks onto `requireOrgAdmin()` so the tenant boundary is one reviewable line.
- One Playwright happy path (login, create project, send offer, accept via gig link) against a staging org, then make it a CI gate.
- Supabase CLI-linked migrations so "merged" and "applied" stop meaning different things.
- Pay down lint and flip the CI lint step to blocking.

## 2026-09-18 alerting (A8: nobody was told when things broke)

The launch assessment found three gaps left over from the first pass: cron failures only ever hit `console.error`, nothing told an org when a card declined, and a bounced/complained musician address kept showing "sent" forever.

**Cron job-level alerting, in one wrapper.** Every one of the 7 routes under `src/app/api/cron/*` now runs its body through `runCronJob(jobName, fn)` (`src/lib/cron.ts`). A fatal failure — the routes now `throw` instead of hand-rolling `notifyOps(...); return NextResponse.json(...)` at each fetch site — is reported exactly once: `notifyOps` (Sentry + a best-effort email to `PLATFORM_ADMIN_EMAIL`) and `serverError()` (the same generic, non-leaky 500 every other API route returns, also captured to Sentry). Per-recipient send loops (offer reminders, staffing alerts, pre-gig notifications, expired offers, song-planner nudges) keep running through partial failures, but now count them and return the count in the JSON body (`emailFailures` / `sendFailures`) instead of only logging. `requireCronAuth()` is still always the first line.

**Payment-failed dunning email.** The Stripe webhook's `invoice.payment_failed` branch used to only flip `subscription_status` to `past_due`. It now also emails the org owner (`src/lib/email/billing-notices.ts` → `sendPaymentFailedEmail`, template at `src/lib/email/templates/payment-failed.tsx`) with the amount due, the next retry date, a link to the Stripe-hosted invoice when Stripe supplies one, and a CTA to `/dashboard/settings` to update the card. The email always fires AFTER `applyOrgUpdate` succeeds, never before, and a send failure is caught and logged (never thrown) — the webhook must always ack Stripe.

**Resend bounce/complaint webhook.** New route: `POST /api/webhooks/resend` (`src/app/api/webhooks/resend/route.ts`). Verifies the Svix signature Resend signs webhooks with (HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${body}`, checked against every key in the space-delimited `svix-signature` header, constant-time compare, 5-minute timestamp tolerance) — fails closed (401) on any missing header, unset secret, stale timestamp, or mismatched signature. On `email.bounced` / `email.complained` it looks up `email_logs` by `resend_email_id`, sets that row's `status`, and sets `musicians.email_status` + `email_status_at` on the linked musician (migration `087_musician_email_status.sql`, additive, defaults `'ok'`). `email.delivered` resets a musician back to `'ok'`. Unknown event types get a 200 — nothing to do, not a failure. The roster (`src/components/musicians/musicians-client.tsx`) shows a small destructive badge, "Email bouncing" or "Complained", next to the address; no query change was needed since the musicians page already selects `*`.

### What David must configure

- **`RESEND_WEBHOOK_SECRET`** — in the Resend dashboard: Webhooks → Add Webhook → endpoint `https://<your-domain>/api/webhooks/resend` → subscribe to `email.bounced`, `email.complained`, `email.delivered` → copy the `whsec_...` signing secret into Vercel (Production and Preview). The route 401s everything until this is set — fails closed, not open.
- Apply migration `087_musician_email_status.sql` before (or alongside) deploying — same rule as every other migration in this repo: merging the PR does not apply it (see `project_migrations_not_auto_applied`).
- Nothing else is new to configure: `PLATFORM_ADMIN_EMAIL` and `NEXT_PUBLIC_SENTRY_DSN` from the first pass already power the cron alerting.

### Verification

- `npx vitest run` — new: `cron-alerting.test.ts` (27), `resend-webhook.test.ts` (14), `payment-failed-email.test.ts` (7); extended `billing-webhook.test.ts` (+3) and `reliability.test.ts` (updated 2 assertions for the `runCronJob` wrapper). All green alongside the existing cron/email suites (175 tests across the 9 files touched by this pass).
- `npx tsc --noEmit` clean for every file this pass owns.
