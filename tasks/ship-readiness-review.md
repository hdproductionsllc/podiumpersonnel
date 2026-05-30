# Podium Personnel — Ship-Readiness Review

_Generated 2026-05-29 from a deep multi-agent code review (8 dimensions, every finding verified against the actual code)._

**Verdict: NOT ready to ship, and not yet safe to test against real musicians.**
**Ship readiness: 🔴 RED.**

This is an honest assessment so you can adjust expectations rather than be surprised. The product is close in many areas, but there are **five confirmed blockers** that must be fixed before any real musician interacts with the system, plus a set of high/medium issues to clear before paying subscribers rely on it. Every finding was verified by reading the actual code; file references are included so it can be acted on immediately.

---

## The headline: you cannot test safely today

Your #1 rule is "real musicians must NOT receive any email during testing." Right now there is **no way to enforce that.** Email sending is all-or-nothing: if the Resend API key is set (which testing requires), every musician-facing email goes out for real. Worse, several scheduled background jobs ("crons") send email automatically with no human watching — the offer-reminder job runs **daily at 12:00 UTC** and will nag a real musician about a test offer.

The fix is clean and centralized: there are exactly **two** functions in the whole codebase that actually send email (`src/lib/email/send.ts:108` and `:829`). Gating both through one shared helper suppresses 100% of outbound mail when safe mode is on. This must be done before anything else.

---

## Blockers (do not ship / do not test until fixed)

### 1. No email kill switch — testing will email real musicians
- **What:** `sendTransactional` (`send.ts:108`) and `sendEmail` (`send.ts:829`) both call Resend unconditionally. `client.ts:7` only warns if the key is missing — it does not gate sending. No safe-mode/allowlist flag exists anywhere. Four crons (`offer-reminders`, `expire-offers`, `pre-gig-reminders`, `staffing-alerts`) auto-send; `offer-reminders/route.ts:117` reaches a live **musician** with no human in the loop.
- **Fix:** Add `EMAIL_SAFE_MODE` (default ON when unset) and `EMAIL_ALLOWLIST` in `client.ts`; export a `filterRecipients(to)` helper and call it at both `send.ts:108` and `:829`. When suppressed, log `[EMAIL SUPPRESSED]` and return a synthetic `{ id: null, emailHtml }` so the ~30 callers and `logEmail` keep working. Add a `CRON_ENABLED` flag so jobs no-op in testing. Document both vars in `.env.example`.
- **Files:** `src/lib/email/send.ts`, `src/lib/email/client.ts`, `.env.example`, `src/app/api/cron/offer-reminders/route.ts`

### 2. Deleting a musician destroys all their payment and 1099 tax history
- **What:** `payments.musician_id` is `ON DELETE CASCADE` (`013_add_payments.sql:8`). The dialog (`delete-musician-dialog.tsx:39-42`) only says "This action cannot be undone." and never checks for payments. Removing a departed musician silently erases every paid row feeding year-end 1099 reporting (`050` indexes payments explicitly for "1099 report queries"). No trash, no audit, no recovery.
- **Fix:** Make "Delete" set `is_active=false` (column exists at `001:45`); reserve true delete for musicians with zero payment history; refuse and show the count when `status='paid'` rows exist. DB backstop: change the FK to `ON DELETE RESTRICT`.

### 3. Deleting a project destroys all paid payment records
- **What:** `projects→services` is CASCADE (`001:102`) and `payments.service_id` is CASCADE (`013:7`), so deleting a project two-hops into payments. The dialog (`delete-project-dialog.tsx:39-66`) only counts services — never mentions payments or positions.
- **Fix:** Count payments for the project's services and block when any are paid, or require a second confirmation with count + dollar total. Prefer archiving (`status='cancelled'`, exists at `001:93`) as the default action; or `ON DELETE RESTRICT` on `payments.service_id`.

### 4. Substitute can NEVER accept an approved sub offer (feature is broken)
- **What:** Both accept routes update the position with an unconditional `.is('musician_id', null)` guard (`gig/[token]/accept/route.ts:99-107`, `musician/offers/[id]/accept/route.ts:126-134`). In a substitution the chair is still held by the original musician, so the guard matches 0 rows, the offer reverts to pending, and the sub is told "This position has already been filled." Result: a phantom-confirmed chair that no one covers.
- **Fix:** Branch on `subRequest`. For a substitution, reassign atomically: `set musician_id = substitute, status='confirmed' where id = position AND musician_id = requesting_musician_id`, and move the original's prior accepted offer to a terminal status (e.g. `released`).

### 5. Cross-tenant breach: one orchestra can email/read another's musicians
- **What:** `send-gig-details/route.ts` passes the URL `projectId` into `send-gig-details.ts`, which fetches the project with the RLS-**bypassing** service client and never checks `project.organization_id === organizationId`. An Org A admin can POST Org B's project id and trigger **real emails** to Org B's musicians plus read their names/emails/phones.
- **Fix:** After the project fetch in `send-gig-details.ts`, throw unless `project.organization_id === organizationId` (column already selected). Put the check in the helper so every caller is protected. **Near-instant fix.**

---

## High (serious; fix before subscribers rely on it)

- **Decline races can corrupt a confirmed chair.** Both decline routes lack the optimistic status lock the accept routes have, and on a non-substitution decline reset the position to `status='vacant'` **without clearing `musician_id`** (`musician/offers/[id]/decline/route.ts:111-137`, `gig/[token]/decline/route.ts:81-96`). Fix: add `.in('status',['pending','viewed'])` to the decline update; set `{ musician_id: null, status: 'vacant' }`.
- **Second cross-tenant leak:** `send-gig-details-reminder/route.ts` loads a `gig_detail_sends` row via the service client without checking it belongs to the caller's org. Fix: verify `sendRecord.organization_id === mem.organization_id`.
- **Open storage bucket:** `project-files` policies (`041:169-188`) gate only on "is logged in," no org scoping, including a blanket DELETE. Any authenticated user who learns a path can download or **delete** another org's sheet music. Fix: scope policies by org folder, or restrict the bucket to service_role and mint URLs through the access-checked API.
- **No support contact in error screens.** All four `error.tsx` boundaries and `not-found.tsx` show "Try again" + an Error ID but no way to reach a human. Fix: add `SUPPORT_EMAIL` + reusable support-link component into every boundary and the two confirm-client inline errors.
- **Public token 404 dumps musicians at the contractor login.** `gig`, `confirm-details`, `confirm-music` call `notFound()`, falling to the root `not-found.tsx` whose only button is "Go to Dashboard" — useless to a logged-out musician. Fix: friendly public not-found/error with portal login link + support contact.
- **gig accept/decline run DB writes outside try/catch.** Only the email block is wrapped, so a transient DB error becomes a raw 500 on the musician's most important flow. Fix: wrap the whole handler; on error redirect back to `/gig/[token]`.
- **Public accept/decline buttons have no loading/disabled state** (`gig-page-client.tsx:493-504`) — frozen page on mobile invites double-taps. Fix: pending/disabled state.
- **Plan gating is globally OFF** (`plan.ts:43-63` never reads `trial_ends_at`; expired trials still return Pro). Intentional, but the entire paywall + trial countdown are inert. Fix: explicit feature flag; document in QA-BILLING.md.
- **Stripe webhook is not idempotent** and ignores `subscription.created`, `invoice.payment_failed`, `invoice.paid` (`billing/webhook/route.ts:29-81`). Fix: dedup by event id; handle the missing events.
- **No soft-delete / audit / restore anywhere.** With the cascades above, accidental deletes are permanent and untraceable. (Venues are the one *safe* delete — `services.venue_id` is SET NULL.) Fix: soft-delete + recovery window for high-value entities; document Supabase backups.

---

## Medium (fix before scale)

- Token decline ignores DB write failure (`gig/[token]/decline/route.ts:81-87`) — musician can be emailed a decline confirmation while the offer stays pending.
- Expiry cron can un-assign an original musician when a pending sub offer expires (`expire-offers/route.ts:90-108`). Only null the chair when no accepted offer exists.
- Several routes leak raw `error.message` to the user (venues, fix-venues, musician/services, musician/offers, musician/profile, auto-populate) via `toast-helpers.ts:14`. Standardize on a generic message + server log.
- Decline reason dropped on the public path — collected in portal, never written by the token route.
- Musician edit deletes-then-reinserts instruments non-transactionally (`musician-form-dialog.tsx:199-227`; bulk loop ignores errors). A partial failure leaves a musician with zero instruments.
- `requireOrgAdmin` uses `.single()` on org membership (`api-helpers.ts:31-36`) — crashes for multi-org users. Use `.maybeSingle()`.
- Plan gates fail OPEN when the org row can't be read. Fail closed once billing is enforced.
- Webhook silently no-ops on missing metadata — a paying customer could never get Pro with no log. Add `stripe_customer_id` fallback + warning.
- Cron failures are silent (console.error only). Route failures to an ops alert.
- Date-window crons use UTC, not org timezone. Add a grace buffer.
- `Clear All` positions uses a raw browser `confirm()` (`project-positions.tsx:357`). Use the app's modal with a count.

---

## Polish (low)

- No `global-error.tsx` — a root-layout crash shows Next.js's unbranded white screen.
- `offer-reminders` double-send window — stamp `reminder_sent_at` atomically *before* sending.
- `staffing-alerts` dedup relies on best-effort log write — back with durable state.
- `inline-offer-card.tsx` can sit on "Refreshing…" forever — add a fallback link.
- Dashboard page non-null assertion on the org row (`page.tsx:30`) — guard with `redirect('/onboarding')`.
- `rescinded` offer status missing from `OFFER_STATUS_LABELS/COLORS` (`project-offers.tsx:53-67`).
- No `SUPPORT_EMAIL` constant — duplicated in two auth forms.
- No per-project staffing tally — admins scan row by row on large projects.

**Positive confirmations (do NOT "fix"):** all six crons require the Bearer `CRON_SECRET`; `expire-offers`, `complete-projects`, `pre-gig-reminders` are idempotent (the latter backed by a UNIQUE constraint); `keepalive` sends no email; venue deletion is honest and non-destructive; the accept routes protect data integrity with optimistic locks even though the UI lacks feedback.

---

## Sequenced plan

1. **Phase 0 — Stop the bleeding (before any more testing):** email kill switch at the two chokepoints (default ON), seed the allowlist with your team, `CRON_ENABLED` flag, and the one-line cross-tenant org check in `send-gig-details.ts`.
2. **Phase 1 — Prevent data loss:** block hard-delete of musicians/projects with paid payments, switch deletes to archive, set payment FKs to `ON DELETE RESTRICT`, guard instrument delete, confirm/enable Supabase backups.
3. **Phase 2 — Fix the offer lifecycle:** substitute-accept branch, decline optimistic locks + clear `musician_id`, token-decline error check, expiry-cron sub protection.
4. **Phase 3 — Errors route to help:** `SUPPORT_EMAIL` + support link in all boundaries, friendly public not-found/error, wrap gig accept/decline in try/catch, stop leaking raw errors to toasts.
5. **Phase 4 — Billing (only when turning it on):** explicit launch flag, trial countdown via `trial_ends_at`, webhook idempotency + missing events, fail-closed plan gates.
6. **Phase 5 — Reliability & polish:** atomic reminder claim, cron failure alerts, button pending states, status-label and dialog polish.

---

## Immediate quick wins (minutes each)

- Cross-tenant org check in `send-gig-details.ts` — closes a blocker in minutes.
- Create `src/lib/constants.ts` with `SUPPORT_EMAIL`; import in the two auth forms.
- Add `rescinded` to the offer status maps.
- Guard the dashboard null-org assertion with `redirect('/onboarding')`.
- Replace `Clear All` `confirm()` with the app's modal showing the count.
- Add the public gig/confirm `not-found.tsx` pointing to the musician portal.

**Bottom line:** the email kill switch is the gate to safe testing and is achievable quickly. The data-loss cascades and the broken substitution flow are the gate to onboarding real subscribers. Budget one to two focused weeks through Phase 3 before letting any real musician touch the product; Phases 4–5 can follow before turning on billing and scaling.
