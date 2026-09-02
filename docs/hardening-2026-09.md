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
