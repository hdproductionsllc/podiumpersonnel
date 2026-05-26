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
- [ ] User: visual verification in dev — send an offer, click Rescind, confirm modal copy, confirm musician inbox shows "withdrawn" not "declined."

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
