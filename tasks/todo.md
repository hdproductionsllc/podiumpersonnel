# V2.0: Vertical Template Architecture (started 2026-07-11)

Full plan: `~/.claude/plans/glistening-forging-thimble.md` · Strategy: `tasks/v2-strategy.md`
Rule of the whole project: every phase is a provable NO-OP for the 4-5 live orgs
(default template `music_contractor` = today's UI string-for-string, frozen by test).
Additive-only migrations; backup before each; David applies SQL before dependent deploy.

## Phase 0 — Safety net (no product code)
- [x] Behavioral tests: in-memory Supabase mock + 18 tests invoking the real
      accept/decline/expire-cron handlers (races, sub transfer, chair protection).
      Old tripwires kept alongside.
- [x] **BONUS: found + fixed a real prod race** — expire-offers cron had no
      optimistic lock; an offer accepted mid-run could be flipped to expired and
      its confirmed chair vacated. Fixed (0b8fd709) + regression test. DEPLOYED.
- [x] `docs/runbooks/database-safety.md` — backup-before-migration runbook + PITR steps
- [x] `docs/runbooks/staging.md` + `scripts/staging-replay.sql` (64 migrations, in order);
      `.env.staging.local` added to .gitignore
- [ ] **David: confirm Supabase PITR/backups** (Dashboard → Project Settings → Database →
      Backups) — still the open checkbox from launch; may need paid add-on (his call)
- [ ] **David: create free-tier staging Supabase project** (or provide access token),
      then run `scripts/staging-replay.sql` there
- [x] tsc + 180/180 tests + production build green; committed (75f66a63,
      0b8fd709, a4784785) and pushed to master 2026-07-11

## Phase 1 — Vertical foundation (invisible)
- [x] `src/lib/verticals/` module: types, terms, registry (resolveVertical never throws,
      Object.hasOwn guard), features, title-rules, seeds, 7 templates fully authored
- [x] `vertical-provider.tsx` (mirrors PlanProvider; passes key only), `useVertical()`/`useTerms()`
- [x] `getOrgVertical()` in api-helpers (fails OPEN to default)
- [x] dashboard layout: fetch `vertical` in its own try/catch (isolated from billing
      query); mount VerticalProvider
- [x] `vertical-identity.test.ts` + `verticals-registry.test.ts` — 28 tests green
- [x] Migration `065_add_org_vertical.sql` written (column + CHECK, with -- verify)
- [ ] **David: backup, then run 065** → then deploy
- [ ] Smoke: prod dashboard identical

## Phase 2 — Template-driven sidebar  ✅ SHIPPED (b1d53c9f)
- [x] `sidebar.tsx` → NAV_ICONS + `NAV_ROUTES` (shared testable module) + `useVertical().nav`
- [x] `nav-mapping.test.ts` freezes default sidebar (label+route+emphasis); removed dead CalendarIcon
- [x] 184 tests green, build clean, pushed to master. Smoke: default sidebar unchanged.

## Phase 3 — Title seam  ✅ SHIPPED (c7df2b20)
- [x] project-positions + book-instrument-chairs → `useVertical().titleRules`
      (getPositionTitle + checkGroupDrift); music = identical, non-music = plainTitleRules
- [x] Deleted dead `formatChairPosition`. Guarded by existing reference-equality
      + title-matrix tests. 184 green, build clean, pushed.

## Phase 4 — String sweep: dashboard pages  ✅ SHIPPED (c3282f96)
- [x] getServerVertical() (React cache) for server components
- [x] Dashboard home swept (person/work nouns; offers left universal). Other
      dashboard pages had no user-facing nouns (render client components).

## Phase 5 — String sweep: components (hotspots, then long tail by folder)  ← BIG
   ~70 client component files. Pattern established: useTerms() + term().
   Hotspots: musicians-client (315), project-positions (217), send-offer-dialog (151),
   book-form-dialog (139). Candidate for a dedicated subagent grind, folder by folder.
## Phase 6 — String sweep: emails (EmailTerms, render-identity tests, self-send diff)

## Phase 7 — Go live for new signups
- [ ] Migration `066_org_vertical_seeding.sql`: DROP 3-arg + CREATE 4-arg RPC
      (NOT create-or-replace — overload trap), keep SQL instrument seed for music path,
      re-GRANT EXECUTE, -- verify block
- [ ] Idempotent `/api/organization/seed-skills` route; onboarding picker (7 cards);
      settings read-only org type
- [ ] Staging: one org per vertical, full walk; **David: backup, run 066**, deploy
- [ ] Prod: old-code signup check, one throwaway vertical org, live orgs unchanged

---

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

## Book Builder Phase A — Repertoire import (started 2026-07-15)
Import David's sheet-music library (3,637 PDFs, ~969MB) into Podium: file BYTES → Cloudflare R2
(external, S3-compatible), METADATA → Postgres. Owner has been burned before — HARD fidelity rules:
byte-identical uploads (stream raw bytes, no base64/re-encode), sha256 at index + re-verify after
upload, original filename preserved, PDFs NEVER renamed/rewritten. READ-ONLY source library.

### Schema (this task)
- [x] `068_repertoire.sql` written — DO NOT APPLY YET. Three additive org-scoped tables:
      - `repertoire` (title/artist/ensemble/norm_title/tags) — identity key
        `(org, norm_title, coalesce(artist,''), ensemble)`; same title+artist in quartet AND trio = 2 rows
      - `repertoire_parts` (part taxonomy vln1|vln2|vla|vc|bass|voice|organ|other|score, substitute,
        played_on, storage_path, original_filename, bytes, sha256) — role key
        `(repertoire_id, part, substitute, coalesce(played_on,''))` dedups the 64 cross-folder repeats;
        storage_path/bytes/sha256 nullable so importer can index metadata BEFORE R2 creds arrive
      - `title_aliases` (alias_norm → repertoire_id) manual remap dictionary, unique `(org, alias_norm)`
      - RLS: members SELECT via is_org_member, admins ALL via is_org_admin, service role bypasses (importer key)
      - No storage.buckets row — R2 is external, not Supabase Storage; -- verify queries at bottom
- [x] **David: backup, then run 068** — applied (library fully imported in Phase A2; re-confirmed
      live 2026-07-15 when the 069 verify probe inserted/deleted a repertoire row)

### Still ahead in Phase A
- [ ] Filename parser: 2,754 canonical "Title - Artist - part.pdf" + 401 SCORE + 395 messy-detectable
      (Naughtin suffixes, "(1)" dupes, "db"/Bass/Organ/Voice) + 81 no-part + 6 substitute ("vla for vc")
- [ ] Normalization fn (unicode-fold curly quotes/U+F028 for MATCHING; PRESERVE original names as metadata)
- [ ] Junk exclusion: `._*` AppleDouble, .DS_Store, *.zip, _report.txt
- [ ] Indexer: walk library, compute sha256, write repertoire + parts rows (storage_path NULL)
- [ ] **BLOCKED: R2 credentials not yet available** — uploader (stream bytes → R2, re-verify sha256, set storage_path)
- [ ] Dry-run report: 36 quartet titles missing parts (e.g. Arioso missing vln1), collision/conflict list

## Book Builder Phase B — Intake import (started 2026-07-15)
Admin pastes a client's 17hats wedding questionnaire (free text) onto a project. Podium PARSES it
into sections/songs, MATCHES each song against the org's repertoire library (Phase A / 068), and
shows a REVIEW screen where the admin confirms/fixes everything before it's saved. FOOLPROOF = the
human-confirm gate: the parser only PROPOSES (status stays 'draft'); nothing is trusted until an
admin confirms. Misparses must be easy to see and fix, never silent. Matching MUST reuse the exact
same normalization as scripts/repertoire-index.js or alias/repertoire lookups miss.

### Schema (this task)
- [x] `069_intakes.sql` written — DO NOT APPLY YET. Two additive org-scoped tables, depends on 068:
      - `intakes` — one per project (`project_id` UNIQUE). source (17hats|manual|client-form),
        status (draft|confirmed) + confirmed_at, `raw_text` kept VERBATIM (re-parse/audit),
        contact_name/phone, venue_note, spotify_url, `processional_order` JSONB string[],
        `recessional_cue` stored word-for-word (never reworded), notes
      - `intake_songs` — one proposed song per row. section (prelude|ceremony|recessional|postlude|
        cocktail_hour|reception|other), position, title_raw/artist_raw, role, `matched_repertoire_id`
        → repertoire(id) ON DELETE SET NULL, `match_status` (matched|ambiguous|missing|manual,
        default missing); unique `(intake_id, section, position)`; org_id denormalized for RLS
      - RLS: members SELECT via is_org_member, admins ALL via is_org_admin **with explicit WITH CHECK**
        (matches siblings 013/053/054), service role bypasses (parser/import key); -- verify block
- [x] TS types `src/lib/intake/types.ts` — IntakeRecord/IntakeSong + Source/Status/Section/MatchStatus
      unions (manual types; database.ts is hand-maintained and doesn't carry the Book Builder tables)
- [x] **David: backup, then run 069** — applied 2026-07-15; verified live via 21/21 REST round-trip
      probes (tables+columns, all CHECKs, both UNIQUEs, FK SET NULL, CASCADE, updated_at triggers,
      defaults, JSONB round-trip). Self-cleaning — no probe rows left behind. 068 confirmed applied
      too (repertoire table accepted the FK-test row).

### Still ahead in Phase B — ✅ ALL SHIPPED (8e77af76 + cf57abb2 + wiring commit 2026-07-15)
- [x] Parser ported from Music Compiler/web/parser.py → src/lib/intake/parser.ts (parity tested)
- [x] normTitle extracted EXACTLY (normalize.ts + 468-line parity guard); matcher w/ alias +
      loose-fold + similarity best-guess + ensemble tiebreak tiers (matcher.ts)
- [x] Paste + parse API (/api/intake/parse, [projectId], alias, repertoire) — requireOrgAdmin
- [x] Review screen (intake-panel + intake-song-row) wired into projects-client expanded row
- [x] 069 applied + verified live (21/21 probes); 282/282 tests; tsc + build green; DEPLOYED

### Phase B3 — Real-usage feedback round 1 (started 2026-07-15, David's live test)
David's findings: (1) quartet-vs-trio "needs a choice" should auto-pick the gig's ensemble;
(2) "not in library" rows almost always show the right work as top guess — matcher too literal,
and every human direction should teach the system; (3) "(*special request*)" inline marker:
parser currently treats those words as a SECTION HEADER (song swallowed!) — must strip the
marker, flag the song, and prompt "mark as special request".
- [x] Migration 070 written: intake_songs.special_request BOOLEAN NOT NULL DEFAULT false (additive)
- [x] Parser: strip inline (*special request*)/(special request) markers BEFORE section
      detection (fixes the header-hijack bug — the song was being swallowed as a phantom
      'special' section header); ParsedSong.specialRequest flag threaded to every addSong
- [x] Matcher: same-work ensemble auto-resolve (sameWorkFamily = identical folded title +
      artist; exactly one candidate matches gig ensemble → matched, not ambiguous)
- [x] Matcher: similarity confidence bands — ≥0.8 (0.7 with agreeing artist) + clear lead
      (≥0.12 over best OTHER work) → proposed matched; ≥0.5 → amber one-click 'ambiguous';
      below → red 'missing' with guesses. Contradicted artist NEVER auto-matches.
- [x] Learning: alias auto-teach on save already fires (checkbox defaults ON when the fold
      differs); ensemble picks need no alias — auto-resolve covers them deterministically
- [x] UI: violet "Mark as special request" prompt when parser flagged the line; low-key
      button on all unresolved rows + Change panel; violet badge (review, confirmed,
      read-only); library pick / as-typed clears the flag; toast counts special requests
- [x] API: parse route carries specialRequest + stats.special; PUT persists special_request;
      isMissingTableError covers 42703 (070 unapplied → 503); IntakeSong type updated
- [x] Tests: 18 new (6 parser incl. the exact "Goodness of God" line, 12 matcher bands +
      auto-resolve); 300/300 green; tsc + production build green
- [x] **070 run by David** → verified live (column exists, 0 rows flipped) → pushed 42626745
      → Vercel Ready, app.podiumpersonnel.com aliased. SHIPPED 2026-07-15.
- [x] David re-tested → 4 more real misparses found + fixed + SHIPPED same day (93c1ea98):
      numbered prefixes ("4. Stand", "20. September"), dash-beats-"by" ("Stand by Me -
      Ben E. King"), non-answers ("N/a"/"None"/"TBD") skipped, 1-char keyword junk killed.
      Plus: "Not a song — remove" action on rows; Confirm no longer hard-blocked — warning
      step + explicit allowUnresolved override (server still rejects plain unresolved confirm).
      309/309 tests. Deployed + aliased.
- [ ] David: re-parse again after this deploy — "20. September" should now auto-match
      (library has it; the "20." prefix was the whole problem)
- [ ] Known data-quality note: some library titles show mojibake in candidate lists
      ("SchoÌˆn Rosmarin") — Mac NFD filenames imported as decomposed unicode. Candidate
      fix: NFC-normalize titles at import/display. Not yet scheduled.

### Phase B4 — Add-to-library from intake ✅ BUILT + SHIPPED 2026-07-15 (David approved;
"work is also avail in future" = permanent library entries, matched by all future intakes)
- [x] r2.ts: getSignedPutUrl (presigned PUT, browser-direct — 4.5MB Vercel cap lesson)
- [x] Bucket CORS set via scripts/r2-set-cors.js (app domain + *.vercel.app + localhost);
      idempotent, re-run to change origins
- [x] R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY added to Vercel prod+preview
- [x] POST /api/repertoire/upload-url — content-addressed key repertoire/<org>/<sha256>.pdf
      (Phase A scheme); already-stored bytes skip upload entirely
- [x] POST /api/repertoire/add-work — server re-downloads + re-hashes EVERY object (fidelity
      gate; corrupt upload deleted + rejected); dedupes on 068 identity key (existing work →
      parts appended, dupes skipped, never overwritten); paths server-derived (cross-tenant)
- [x] AddWorkDialog: files + guessed part dropdowns (part-guess.ts from Phase A naming),
      WebCrypto sha256, per-file status; wired to missing rows + Change panel; on create the
      intake row auto-links (manual match + alias-teach when the fold differs)
- [x] Live presign test against the real bucket: PUT/HEAD/re-hash/delete all PASS
- [x] 315/315 tests (6 new part-guess); tsc + build green
- [ ] David: real-world test — upload the parts for one actually-missing work from an intake row

### Phase C — Book builder ✅ BUILT + SHIPPED 2026-07-15 (3a8c6272)
Per-musician books from a confirmed intake, Mac gig_compiler conventions ported exactly:
- [x] book-builder.ts: section ordering, "NN - Title - Artist - part.pdf" naming, folder
      layouts per ensemble (01_Violin_1…), exact→substitute→vln2-as-vla file picking,
      one-page playlist PDF (pdf-lib, WinAnsi-safe w/ NFC recomposition)
- [x] GET /api/intake/[projectId]/book — manifest w/ presigned R2 GET URLs (confirmed only);
      strips stale client list-numbers from titles
- [x] BookDownload UI in confirmed panel: per-part zips + "all books" zip (folders per part +
      printable playlist); browser-side assembly (fflate, STORE — bytes never re-encoded,
      never through serverless); missing-file heads-up list
- [x] 333/333 tests; end-to-end proof on the REAL confirmed intake (40 songs, 39 vln1 files,
      1 gap = the special request, real part fetched byte-identical)
- [ ] David: download a book, spot-check the playlist + page fidelity
- Note: playlist Spotify link is text-only ("on the gig page") — clickable link = v2 polish

### Phase C2 — Combined single-PDF books ✅ SHIPPED 2026-07-15 (9d1b2a12)
- [x] mergePdfs(): STRUCTURAL merge (pdf-lib copyPages) — pages/fonts/vectors/images copied
      verbatim, never re-rendered/recompressed (the old artifacting = re-rendering pipelines).
      PROVEN on 2 real library PDFs: every source page's content stream byte-identical in the
      merged doc. Damaged source names itself + aborts (no silent missing songs).
- [x] "Combine each book into one PDF" checkbox (default ON): per-part buttons → single
      "<Client> - VIOLIN 1.pdf" (playlist first, songs in order); "all books" → zip of merged
      PDFs + printable playlist. Unchecked = original numbered-files zip. 335/335 tests.

### Phase C3 — Books → Music / Parts ✅ SHIPPED 2026-07-15 (fb5bbdf1)
- [x] "Send to Music / Parts" publishes each combined book as a project file assigned to its
      instrument (exact-name matching, no fuzz; unmatched part = skipped + reported). Rides the
      existing signed-upload + metadata rails; existing Send Music flow emails musicians.
- [x] IntakePanel gets position instruments from projects-client. 338/338 tests.
- [ ] David: publish books on the real project, then Send Music; note re-publishing creates a
      new file each time (delete old ones in Music / Parts if you iterate)

### Phase C4 — Books approval gate + routing confirm ✅ SHIPPED 2026-07-15 (f571f59b)
Owner's pipeline made explicit: confirm → assemble+download → APPROVE books → confirm
routing → publish to Music / Parts → Send Music.
- [x] 071 intakes.books_approved_at (David ran; verified live, 0 pre-approved). EVERY intake
      save clears it — approval covers one exact list.
- [x] POST approve-books (stamp/revoke, confirmed-only). Books UI = numbered 3 steps;
      Send to Music/Parts disabled until approved (timestamped badge, revocable).
- [x] Publish shows routing table first (book → instrument dropdowns, exact-name prefill,
      ambiguous → "Don't send", dup-chair rejected). 338/338 tests. DEPLOYED.

### Phase C5–C7 — Spotify + polish ✅ SHIPPED 2026-07-15 (4729b685, 95ac00b0, fc73459c)
- [x] C5: clickable "Spotify Playlist" link on playlist PDFs (URI annotation, Mac behavior) +
      per-song BOOKMARKS in combined books (outline metadata; fidelity re-proven byte-identical)
- [x] C6: Spotify auto-playlists — 072 spotify_connections (RLS locked, verified: anon sees 0
      rows), OAuth connect/callback/status, per-song track PROPOSALS (review screen, skip
      supported), create playlist in performance order → URL saved onto intake. Creds in
      .env.local + Vercel prod/preview. David added redirect URI to his Spotify app.
- [x] C7: "no weird covers" ranking (named-artist +60, popularity, karaoke/tribute -100,
      covers -50, instrumental/quartet -25, live -10) — proven live: Temptations, Righteous
      Brothers, ABBA, Glenn Miller Orchestra all originals. Pure src/lib/spotify-ranking.ts.
- [x] C7: book auto-versioning — re-publish replaces the previous book per instrument
      (BOOK_NOTES marker; delete only AFTER the new version lands). 347/347 tests.
- [ ] David: Connect Spotify on the confirmed wedding → Build playlist → review picks →
      Create → check the link lands on the intake + playlist PDF

### B3 round 3 ✅ SHIPPED 2026-07-15 (580199f6)
- [x] Walking order empty on the real questionnaire: 17hats puts the EXAMPLE inline on the
      label line; old (Mac-faithful) logic ate the client's real numbered answer as example
      boilerplate. Inline-example detected; run-together "1. Officiant2. Family" lines split
      (two-digit-safe). Verified against the live intake raw_text: 6/6 steps, 40 songs, 0 warnings.
- [x] Confirmed summary counted only AUTO-matches (27) — now counts every library-linked song
      (auto + hand-picked = 39) with an "as typed" segment. 318/318 tests.

### Task 4 — Review UI (done 2026-07-15)
- [x] 1. `GET /api/intake/repertoire?q=` — org-scoped repertoire search for the "Not in library" box.
- [x] 2. Enhance `GET /api/intake/[projectId]` to attach matched repertoire (title/artist/ensemble) per saved song.
- [x] 3. `src/components/intake/intake-panel.tsx` (+ `intake-song-row.tsx`) — EMPTY / REVIEW / CONFIRMED states.
- [x] 4. Wire "Client Selections" collapsible section into projects-client expanded row (canManage only).
- [x] 5. tsc clean + 250/250 tests + production build green.
  Decisions: fold parser sections → IntakeSection enum at parse (see == save == reload); resolved =
  matchStatus in (matched|manual); human pick → 'manual', auto hit → 'matched'; lazy fetch on first open;
  503 (069 unapplied) degrades to a muted note; skip project-card chip (invasive server join).

---

# LAUNCH PREP (2026-07-17) — plan: ~/.claude/plans/virtual-juggling-goose.md

## Phase B+C — Musician self-signup unblock + claim-email prefill (loop-killer)
- [x] B1 register-form.tsx: delete roster pre-check, soften info box
- [x] B2 OAuth callback: stop signing out no-roster users (REQUIRED pair with B1)
- [x] B3 portal pages: stop redirecting empty rosters (page/profile return null; offers/[id] → /musician)
- [x] B4 layout empty state: post-signup copy + "create an organization" CTA
- [x] B5 tests: open signup + callback branches
- [x] C1 email prefill: gig page → CTA ?email= → register page → form default

## Phase A — Intake/Book Builder internal-only gate
- [x] A1 migration 073_intake_flag.sql + append to launch-pending-migrations.sql
- [x] A2 requireIntakeEnabled() in api-helpers.ts (fail closed 404)
- [x] A3 swap guard in 11 intake/repertoire route handlers
- [x] A4 OrgFlagsProvider + dashboard layout fetch + projects-client gate
- [x] A5 tests: false→404, error→404, enabled→pass

## Phase D — Linked "via Podium" footer
- [x] D1 podium-footer.tsx shared component + PODIUM_FOOTER_URL
- [x] D2 adopt in email-layout + 18 templates + raw-HTML unassign + 2 previews

## Phase E — Coupon + waitlist
- [x] E1 checkout: allow_promotion_codes: true
- [x] E2 marketing site: hosted waitlist form embed (Tally)

## Ops (David)
- [ ] Confirm/apply migrations 064, 065, 066, 068–072 in prod
- [ ] Apply 073 → UPDATE intake_enabled=true for internal org(s) → THEN deploy (this order, zero downtime)
- [ ] Vercel prod env: EMAIL_SAFE_MODE=false, NEXT_PUBLIC_BILLING_ENABLED=true, CRON_ENABLED=true
- [ ] Stripe live: create founding-member coupon + promo code
- [ ] Create Tally (or similar) waitlist form, embed goes live with marketing push

## Security remediation (post-review, 2026-07-17)
- [x] Migration 074_harden_link_musician_rpc.sql: RPC now links only the caller's
      own VERIFIED email (auth.users.email_confirmed_at required), p_user_id must
      equal auth.uid(), anon execute revoked, service_role exempt. Also appended
      to launch-pending-migrations.sql.
- [x] register-form.tsx: removed the client-side link RPC call entirely — linking
      happens only in the auth callback with the session-verified email.
- [ ] **David ops: confirm "Confirm email" is ON in Supabase Auth settings** —
      the email_confirmed_at guard assumes signups aren't auto-confirmed.

## Verification log (2026-07-17)
- Phases A–E implemented via 15-agent workflow (all done, 0 errors); build passed,
  vitest 362/362 green both after implementation and again after the security fix.
- Adversarial review: plan-compliance 0 findings, correctness 0 findings,
  security 1 major (unverified-email linking) → fixed above (074 + form change).
- New tests: require-intake-enabled (5 cases incl. fail-closed 404s),
  musician-auth-callback-behavior (org-admin/linked/no-roster branches).
- NOT YET DEPLOYED: nothing committed/pushed; prod order is
  073+074 SQL → intake_enabled UPDATE → push to master.

## DEPLOYED LIVE 2026-07-18
- App (app.podiumpersonnel.com): new code verified serving (open-signup register copy).
- DB: 073+074 applied by David; 4 internal orgs flagged; anon RPC probe links 0 rows.
- Marketing (podiumpersonnel.com): /waitlist live w/ Tally embed + pricing link
  (required commit 633b000e — Vercel skips marketing builds unless push HEAD
  touches podium-marketing/; see lessons + memory).
- Still David: Vercel env flips (then redeploy), Supabase "Confirm email" check,
  Stripe promo code, Tally form ID, optional PUBLIC-grant revoke SQL.
