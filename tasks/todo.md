# LAUNCH: land hardening, verify everything, go live (2026-06-09)

Full plan: `~/.claude/plans/serene-wobbling-lightning.md`. Scope per David: everything
except billing/payments enforcement; existing orgs free forever; "1000% sure it works."

## Phase 1 — Merge stranded `ship-readiness-hardening` into master
- [x] Merge on branch `land-ship-readiness` (commit c8b88d35). Only 2 conflicts, both
      taken from branch side (strict supersets): musician/offers route, offer-detail badge.
- [x] Comped-Pro tier in `resolveOrgPlan` (`plan_tier='pro'` + no sub = Pro forever),
      placed AFTER past_due so paying subscribers keep grace-period status. +2 tests.
- [x] `npm install` (lucide 0.562→1.7.0 major, radix-ui meta removed) — no breakage.
- [x] tsc clean, 134/134 vitest, production build green.
- [x] Sanity: upload-flow files byte-identical to master; rescind route + email intact.
- [x] `getAppUrl()` trims (prod env var had a literal trailing newline in the URL).

## Phase 2 — Database
- [x] Probed prod: 051 applied, 064 missing; 047/059/062/063 idempotent → one SQL file.
- [x] `scripts/launch-pending-migrations.sql` written (047+059+062+063+064 + self-verify).
- [x] All 6 existing orgs comped to `plan_tier='pro'` via REST (inert until billing flips).
- [ ] **David: run `scripts/launch-pending-migrations.sql` in Supabase SQL editor** —
      063 is REQUIRED before deploy (accept routes write status='released').
- [ ] David: confirm Supabase backups/PITR enabled (Dashboard → Database → Backups).

## Phase 3 — Vercel env (DONE) + deploy (gated on Phase 2 SQL)
- [x] Production: `EMAIL_SAFE_MODE=false` (was "" = would have suppressed ALL prod email
      on deploy!), clean `NEXT_PUBLIC_APP_URL`, removed stale SIGNUP_ACCESS_CODE/EMAIL_FROM/ALLOWLIST.
- [x] Preview: `EMAIL_SAFE_MODE=true` + `EMAIL_ALLOWLIST=henrydavidphotography@gmail.com`
      → previews are now guaranteed email-safe test environments.
- [ ] Push `land-ship-readiness` → master → Vercel deploy (AFTER SQL runs).

## Phase 4 — E2E verification (after deploy)
- [x] Deploy healthy (one failed build caught pre-live: undeclared @react-email/render; fixed).
- [x] Real-usage validation 06-12: offers to 3 real musicians delivered, accept flow worked,
      rescind delivered ("withdrawn" email confirmed via Resend, status=delivered).
- [x] FOUND + FIXED (d078d309): 5 routes sent email without logging to email_logs →
      invisible in Sent Emails tab (rescind, portal accept/decline, portal invites,
      sub approve). All now log; sendTransactional returns subject; tab labels added;
      Sorah's missed rescind row backfilled. Rescind copy made matter-of-fact per David.
- [ ] Offer to David's own email → lands in Primary tab → accept via gig link.
- [ ] Sub-request flow end-to-end (exercises 'released' status).
- [ ] Gig details send. >5MB PDF upload. Musician portal login. (Bucket cap 40MB ✓)
- [ ] Security: cross-tenant send-gig-details rejected; storage isolation.
- [ ] Fresh signup funnel (marketing site → signup → onboarding → welcome email).
- [ ] mail-tester.com spam score.

## Phase 5 — Hygiene (non-blocking)
- [ ] Duplicate "Project String Quartet" org (5ba29961…) — investigate, archive if empty.
- [ ] ~15 no-email duplicate musician pairs — review with David, then merge script.
- [ ] bravura/podium-marketing/xlsx clutter out of repo root.
- [x] `tasks/billing-launch.md` runbook written (billing = 30-min config job when ready).

---

# Fix music/parts upload failing on files >4.5MB (2026-06-09)

**Problem:** Uploading a PDF part fails with `Unexpected token 'R', "Request En"... is not valid JSON`.
Root cause: app advertises a 40MB limit, but the upload streams the file *through* a Vercel
serverless API route, which has a hard ~4.5MB request-body cap. Vercel rejects oversized bodies at
the edge with a plain-text "Request Entity Too Large", and the client's `res.json()` chokes on the "R".

**Fix from first principles:** Don't route file bytes through the serverless function at all.
Browser asks the server for a short-lived **signed upload URL**, uploads the PDF **directly to
Supabase Storage** (handles 40MB+), then posts only small JSON metadata to record the row. The
API never sees the bytes, so the 4.5MB cap is irrelevant and the promised 40MB actually works.

## Steps
- [x] New route `POST /api/projects/[projectId]/files/upload-url` — auth/admin/project checks,
      validate pdf + size, mint a signed upload URL via admin client, return `{ token, path }`.
- [x] Repurpose `POST /api/projects/[projectId]/files` — accept JSON metadata instead of formData;
      validate storagePath is within this org/project; verify object exists in storage (authoritative
      size, no orphan rows); insert project_files row + instrument assignments.
- [x] Rework client `handleUpload` in `project-files-section.tsx` — get URL → uploadToSignedUrl →
      POST metadata. Use browser supabase client.
- [x] `npx tsc --noEmit` clean.
- [ ] User: verify a >5MB PDF uploads successfully in the app.
- [ ] CHECK: confirm the `project-files` storage bucket's max-file-size limit in Supabase is ≥40MB
      (Storage → buckets → project-files). The old path never sent >4.5MB, so the bucket cap is untested.

---

# Merge duplicate musician records (2026-06-08)

**Problem:** Roster has duplicate musician entries within a single org — same person entered
twice, often with the email on one copy and missing on the other (e.g. Christopher Ahn has the
email, Chris Ahn has the phone, both in Subito Strings).

**Scope decided with user:** Only merge "confident" pairs where a clear keeper exists (a record
WITH an email). Pairs where neither copy has an email are left for manual review (could be two
different people sharing a name). Never merge across organizations — each org keeps its own roster.

**Principle:** Merge, not delete. Keep the email-bearing record, move any history (instruments,
book entries, positions, offers, subs, schedules, payments) onto it, fill its blank fields from
the twin, then remove the emptied twin. (Matches the house rule: preserve records with history.)

## The 12 merges (keeper ← twin)
- 6 trivial (twin is an empty stub, no history): Ruzanna Sargsyan, Amanda Marshall, Leah Metzler,
  Graham Woodland, Victoria Bietz, Tara Santiago [Subito Strings / Project SQ].
- 6 with history to move: Shelly Ren, Foster Wang, Rachel Halvorson, Danielle Cho,
  Mc Kayla Talasek, Christopher/Chris Ahn.
- No payment/1099 records sit on any twin being removed (all on keepers) — verified.

## Steps
- [x] Write `scripts/merge-duplicate-musicians.js` (backup → dry-run → apply).
- [x] Run backup: dump all 24 musician rows + their FK rows to timestamped JSON (reversibility).
      → `scripts/backups/musicians-merge-2026-06-08T14-37-36-170Z.json`
- [x] Dry-run: print exact planned reassignments/deletes/field-fills.
- [x] Apply merges (handle `musician_instruments` unique(musician_id,instrument_id) conflicts).
- [x] Verify: total 419 → 407 (12 removed), 0 twins remain, keepers intact, Christopher Ahn keeper
      now has email + phone, 0 remaining same-org dup groups have an email on any copy. DONE.

## Left for manual review (~16 pairs, no email on either copy)
Both-blank same-org pairs: Michelle Sheehy, Sorah Myung, Daniel Smith, Clement Chow (phone only),
Rebecca Matayoshi, Ruzanna Sargsyan [SSQ], Hillary Smith, Shelly Ren [SSQ], Chris Ahn [SSQ],
Victoria Bietz [SSQ], Jennifer Li, Garik Terzian, Ginger Murphy, Maksim Velichkin,
Hui Ping/Hui-Ping Lee, Tom/Thomas Patrick Farrell. (Most in Subito String Quartet.)

## Out of scope
- Cross-org "duplicates" (same person on two orgs' rosters) — by design, not touched.
- A reusable in-app merge UI — candidate for v2 so this doesn't recur on future imports.

---

# Rescind Offer (replace admin "Decline on behalf")

**Problem:** In project positions table, when a position has the `offered` status, the admin sees a destructive "Decline" button. The label is misleading (decline = musician action) and the underlying action sends the musician a "You declined the offer" email even though the admin is the one cancelling.

**Fix from first principles:** Introduce `rescinded` as a distinct offer status — the semantic difference between "musician declined" and "admin rescinded" matters for reporting/history. Rename the UI action to "Rescind," and send a dedicated "offer withdrawn by admin" email.

## Changes
- [x] Migration `061_add_rescinded_offer_status.sql` — extends `contract_offers.status` check constraint to allow `'rescinded'`.
- [x] `src/types/database.ts` — added `'rescinded'` to the `contract_offers.status` union (Row/Insert/Update).
- [x] `src/lib/email/templates/offer-rescinded.tsx` — new musician-facing email saying the offer was withdrawn.
- [x] `src/lib/email/send.ts` + `index.ts` — added `sendOfferRescindedEmail`; widened `sendAdminOfferResponseEmail` status union.
- [x] `src/lib/email/templates/admin-offer-response.tsx` — `'rescinded'` branch (preview, banner, body).
- [x] API route renamed `decline-offer/` → `rescind-offer/`; sets `status: 'rescinded'`, sends rescinded email, admin notif with `'rescinded'`, preserves sub-request branch.
- [x] `src/components/projects/project-positions.tsx` — state/handler renamed, button "Decline"→"Rescind," modal copy, fetch URL.
- [x] `src/app/api/musician/offers/route.ts` — history filter includes `'rescinded'`.
- [x] `src/app/dashboard/page.tsx` — activity badge color + label for `'rescinded'`.
- [x] `src/components/musician/offer-detail.tsx` — status badge for `'rescinded'`.
- [x] `src/components/gig/gig-page-client.tsx` — gig link shows "withdrawn" message instead of nothing if a musician opens a rescinded link.
- [x] `npx tsc --noEmit` clean (after clearing stale `.next/types`).
- [x] Migration 061 run in Supabase — verified 2026-05-22 via REST round-trip on offer `224d2d9d…`: UPDATE to `status='rescinded'` accepted by CHECK constraint.
- [x] 2026-06-07: Re-applied JUST the rescind feature onto `master` (it had been stranded in the
      unmerged `ship-readiness-hardening` mega-commit; master still showed old "Decline on behalf").
      Cherry-picked the rescind bits by hand (skipped unrelated Clear-All/null-org/submit-state/`released`
      changes). Committed `5f639833`, pushed to origin/master (Vercel auto-deploy). `tsc --noEmit` clean.
      Re-verified prod constraint allows `rescinded` via safe round-trip probe on offer `538316ff…`
      (flipped to rescinded, restored to declined).
- [ ] User: visual verification in prod — send an offer, click Rescind, confirm modal copy, confirm musician inbox shows "withdrawn" not "declined."

## Decisions (kept narrow on purpose)
- `next-candidate.ts` and `project-offers.tsx` waterfall: NOT including `'rescinded'`. Rationale: declined = "musician said no, don't suggest them again"; rescinded = "admin pulled it back, often for unrelated reasons" — the admin is already in active control, no need for waterfall suggestions, and the rescinded musician should remain a valid manual candidate.

## Out of scope
- No retroactive migration of existing `declined` offers (history stays accurate to what actually happened).
- Sub-request `'sub_declined'` status unchanged — that's a real musician decline of a sub offer.

---

# Email Deliverability Overhaul (Stop landing in Promotions/Spam)

**Problem:** Musicians report not receiving emails Resend shows as `delivered` — they're landing in Promotions/Spam. Triggers in current code: HTML-only (no plain-text alternative), no `replyTo`, no `List-Unsubscribe` headers, "⚠️ URGENT:" subject prefixes, "friendly reminder" marketing language, big colored CTA buttons, generic "Podium Personnel" from-name.

**Fix from first principles:** Transactional emails should look and behave like real correspondence from the org the musician knows — not like marketing campaigns. Centralize deliverability concerns in one wrapper so every send picks them up. Personalize sender identity. Tone down body copy. Keep visual changes pragmatic.

## Phase 1 — Centralized infrastructure (touches every send)
- [x] `src/lib/email/client.ts` — split `EMAIL_FROM` into `EMAIL_FROM_ADDRESS` + `buildFromAddress(displayName)` helper.
- [x] `src/lib/email/send.ts` — added `sendTransactional()` wrapper (plain-text via `{ plainText: true }`, replyTo, List-Unsubscribe headers, centralized error logging).
- [x] Refactored all 25 `send*Email()` functions to use `sendTransactional()`. Per-org `fromName` on musician-facing sends; "Podium" on admin notifications.

## Phase 2 — Subject line cleanup
- [x] Removed `⚠️ URGENT:` prefix from offer reminder.
- [x] Removed `⚠️` from "Offer Expiring" admin subject.
- [x] Softened "Action Required:" → "Your sub declined", urgency labels.

## Phase 3 — Reply-To routing (replies reach org owner, not unmonitored hello@)
- [x] Added `getOrgOwnerEmail(orgId)` helper in `src/lib/supabase/server.ts`.
- [x] `sendTransactional()` accepts `replyToOrgId` and resolves to owner email via lookup.
- [x] Added `organizationId?` param to 16 musician-facing send functions.
- [x] Updated 14 call sites to pass `organizationId: organization?.id`.

## Phase 4 — Body copy cleanup (high-volume musician templates)
- [x] `offer-reminder.tsx` — no warning emoji, no "friendly reminder", text-link CTA, no colored header.
- [x] `contract-offer.tsx` — softened opener, text-link CTA, no colored header, "Hi" not "Dear".
- [x] `gig-details.tsx` — no colored header, text-link CTA.
- [x] `gig-details-reminder.tsx` — no colored header, text-link CTA, conversational tone.
- [x] `portal-invitation.tsx` — no colored header, text-link CTA, condensed copy.
- [x] `music-uploaded.tsx` — no colored header, text-link CTA.
- [x] `music-reminder.tsx` — no colored header, text-link CTA.
- [x] `w9-request.tsx` — no colored header, "Hi" not "Dear", trimmed boilerplate.
- [x] `offer-accepted.tsx` — removed "✓ You're Confirmed!" banner + colored header, "Hi" not "Dear".

## Phase 5 — Verification
- [x] `npx tsc --noEmit` clean after all changes.
- [ ] User test: send self a real offer email, verify it lands in Primary tab (not Promotions) on personal Gmail.
- [ ] Optional: send test to `test-xxxx@mail-tester.com` for a spam score.

## Templates NOT touched (intentional)
- `offer-declined.tsx`, `offer-rescinded.tsx`, `position-unassigned.tsx`, `musician-released.tsx`, `sub-request-*.tsx`, `sub-declined-find-another.tsx` — never had the colored header bar; already low-key. Got the deliverability infrastructure (plain-text/replyTo/headers) for free via the wrapper.
- `musician-welcome.tsx`, `admin-welcome.tsx` — Podium-branded, not org. Lower deliverability risk.
- All admin-facing templates (offer-expired, offer-expiring-soon, staffing-alert, pre-gig-notification, admin-offer-response, admin-offer-sent, admin-sub-request) — going to colleagues; spam-tab placement matters far less.

## Decisions
- **From name = org name only** (e.g., "Northwest Sinfonia <hello@podiumpersonnel.com>"). Chosen over admin-name format because cron-triggered reminders don't have a "sender" admin, and org name is what musicians recognize. Admin emails (system notifications back to org) keep "Podium" as sender.
- **Reply-To = `hello@podiumpersonnel.com`** for now. Future: route to org-specific inbox when org has set one.
- **Visual overhaul is pragmatic, not exhaustive.** Drop big colored headers + giant buttons on musician-facing templates. Admin templates left as-is — they're going to colleagues, deliverability matters less.

## Out of scope (Phase 5+)
- Per-org reply-to routing (requires org settings field).
- BIMI logo display in inbox (requires VMC certificate, $$$).
- Admin-facing template visual cleanup.
- Engagement-based pruning of unresponsive recipients.

---

# Ship-Readiness Plan (from deep review 2026-05-29)

Full analysis: `tasks/ship-readiness-review.md`. Status: 🔴 RED — do not test against real musicians until Phase 0 is done.

## Phase 0 — Stop the bleeding (BEFORE any more testing) ✅ DONE 2026-05-29
- [x] Add `EMAIL_SAFE_MODE` + `EMAIL_ALLOWLIST` + `filterRecipients()` helper in `src/lib/email/client.ts`
- [x] Gate both send chokepoints: sendTransactional + sendEmail (both `resend.emails.send` sites)
- [x] Suppressed sends log `[EMAIL SUPPRESSED]` and return synthetic `{ id: null }` (callers untouched)
- [x] Default `EMAIL_SAFE_MODE` ON when unset (fail-safe); documented in `.env.example`
- [x] Add `CRON_ENABLED` flag (`src/lib/cron.ts`) wired into 5 cron routes (keepalive exempt)
- [x] Seed `EMAIL_ALLOWLIST` with henrydavidphotography@gmail.com (in `.env.local` + `.env.example`)
- [x] Cross-tenant org check in `src/lib/send-gig-details.ts` (closed blocker leak)
- [x] BONUS: closed 2nd cross-tenant leak in send-gig-details-reminder route
- [x] 13 new tests in `email-safe-mode.test.ts`; full suite 90/90 green; tsc clean
- [ ] **USER ACTION:** set `EMAIL_SAFE_MODE=true` + `EMAIL_ALLOWLIST=...` in Vercel env (prod/preview)

## Phase 1 — Prevent permanent data loss ✅ DONE 2026-05-29
- [x] Musician delete → deactivates (`is_active=false`) when payment history exists; preserves it
- [x] Project delete → archives (`status='cancelled'`) when payment history exists
- [x] Migration `062_protect_payment_records.sql`: payments FKs → `ON DELETE RESTRICT` (DB backstop)
- [x] Instrument delete blocks when used by positions (esp confirmed) or musicians
- [x] 9 regression tests in `data-safety.test.ts`
- [ ] **USER ACTION:** run migration 062 in Supabase; confirm daily backups / PITR enabled in dashboard

## Phase 2 — Fix the core offer lifecycle ✅ DONE 2026-05-29
- [x] Substitute-accept branch in both accept routes (transfer chair from original); release original's offer
- [x] Migration `063_add_released_offer_status.sql` + type union + status labels (released/rescinded)
- [x] Optimistic status locks on both decline routes; clear `musician_id` on reset
- [x] Token decline now captures DB error + bails out if already responded
- [x] Expiry cron excludes `accepted` offers when deciding to vacate (sub-flow protection)
- [x] `released` rendered on musician offer-detail + included in portal history
- [x] 14 regression tests in `offer-lifecycle.test.ts`; suite 113/113 green; tsc clean
- [ ] **USER ACTION:** run migration 063 in Supabase

## Phase 3 — Errors route to help, no dead ends ✅ DONE 2026-05-29
- [x] `src/lib/constants.ts` (`SUPPORT_EMAIL` + `supportMailto`) + `SupportLink`/`SupportHint` components
- [x] Support hint in all 4 error.tsx + root not-found.tsx + new `global-error.tsx` + both confirm clients
- [x] Friendly public not-found.tsx for gig + confirm-details + confirm-music (→ musician portal, not /dashboard)
- [x] Wrapped gig accept/decline handlers in try/catch → redirect back to `/gig/[token]`
- [x] Standardized 500s: `serverError` helper on 3 musician routes; generic messages on venues + auto-populate
- [x] tsc clean; 113 tests; `next build` compiles successfully
- Note: auth forms still hardcode the email string (works; can swap to SUPPORT_EMAIL later — cosmetic)

## Phase 4 — Billing correctness (before turning billing ON) ✅ DONE 2026-05-30
- [x] Explicit `NEXT_PUBLIC_BILLING_ENABLED` flag gates all enforcement (default OFF); documented in QA-BILLING.md
- [x] `resolveOrgPlan` honors `trial_ends_at` with days-remaining countdown (when billing on)
- [x] Webhook idempotency via `stripe_events` table (migration 064); handles created/payment_failed/invoice.paid
- [x] `stripe_customer_id` fallback for invoice events + logging when org can't be resolved
- [x] `getOrgPlan` fails closed (returns free) on lookup error when billing enabled
- [x] 9 regression tests in `billing-webhook.test.ts`; plan tests rewritten for both modes; suite 122/122 green
- [ ] **USER ACTION:** run migration 064; set `NEXT_PUBLIC_BILLING_ENABLED=true` in Vercel only when launching billing

## Phase 5 — Reliability & polish ✅ DONE 2026-05-30
- [x] offer-reminders claims the offer atomically (reminder_sent_at) before sending — no duplicate reminders
- [x] `notifyOps` helper emails PLATFORM_ADMIN_EMAIL on fatal cron failures (offer-reminders + expire-offers); respects allowlist
- [x] Public gig accept/decline buttons show a submitting state + disable to prevent double-taps
- [x] `rescinded`/`released` in OFFER_STATUS labels (Phase 2); Clear All now uses the app Dialog with a count
- [x] Dashboard redirects to /onboarding instead of crashing on a null org
- [x] 6 regression tests in `reliability.test.ts`; suite 128/128 green; `next build` clean
