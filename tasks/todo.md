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
