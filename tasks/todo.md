# Launch hardening (2026-09-18)

Source of truth: `tasks/launch-assessment-2026-09-18.md` (committed on master before
any code changed). Every item below maps to a section-A / A8 finding there. Work on
branch `launch-hardening-2026-09-18`; ONE push to master at the end, after David has
pasted the migrations (data before code).

## W1 — Security migrations (Opus)
- [x] 084 drop `Users can insert their own membership` policy (A1); staging-replay.sql updated
- [x] 085 org-scoped storage policies on `project-files` bucket (A2); shared-library access verified unaffected
- [x] 086 venues policies as a numbered migration (A9)
- [x] `scripts/launch-hardening-2026-09-18.sql` paste script with RESULTS table
- [x] policy-safety tests extended

## W2 — Offer engine integrity (Opus)
- [x] rescind-offer: status-conditioned update, 0 rows = already answered (A3)
- [x] unassign: preserve contract_offers history via status, no DELETE (A4)
- [x] substitutions approve/decline: conditional update before side effects, retry-safe (A5)
- [x] tests for all three (none existed)

## W3 — Honest email results (Sonnet)
- [x] `sendTransactional` returns a distinct suppressed result (A6)
- [x] send-email route logs `email_logs.status='suppressed'`, returns `emailSent:false`
- [x] send-offer dialog shows a warning, not "Call sent!"
- [x] tests

## W4 — Ops alerting (Sonnet)
- [x] all 7 crons report job-level failure via notifyOps + Sentry (A8)
- [x] payment-failed email on `invoice.payment_failed` (A8)
- [x] Resend bounce/complaint webhook + migration 087 `musicians.email_status` + roster badge (A8)
- [x] tests

## W5 — Small (main thread)
- [x] vitest hookTimeout so cron tests stop timing out under load
- [x] marketing: remove "Multi-ensemble management", fix calendar "auto-sync" copy

## Verification gate (before push)
- [x] `npx tsc --noEmit`, `npm test`, `npm run build` green
- [x] polish pass: each finding in the assessment marked fixed / deferred with evidence
- [x] David pastes `scripts/launch-hardening-2026-09-18.sql`, all RESULTS rows PASS (2026-09-18)
- [x] merged, pushed 02fe51b2 + 9b692b40 (marketing build had been skipped by the HEAD^ ignore rule; fixed), both projects live, pricing page verified

## On David (not code)
- [ ] Supabase PITR (A7) — DECLINED for now ($125/mo on free plan). Next: free GitHub Actions backup job to R2, Pro at first paying customer
- [x] `NEXT_PUBLIC_SENTRY_DSN` set in Vercel Production, verified in deployed bundle (A8)
- [x] `RESEND_WEBHOOK_SECRET` set + Resend webhook created (A8); route verified 401 on unsigned calls
- [ ] `select * from app_settings;` → confirm billing_enforced (section B)

---

# Gig-details preview shows bare venue name (2026-09-17)

## Diagnosis (verified with a real user session, not a grep)
- Admin login sees 0 rows in `venues` (admin key sees 16 in PSQ). Projects, members,
  musicians all read fine → the `venues` RLS policy from migration 003 is the fault.
- Preview dialog reads venue through the user session → null → bare text.
- Email itself uses the admin key → includes address + map link when the gig is linked.
- Sept 15 Johann Kurtz batch went out bare because the gig was unlinked at the time.

## Tasks
- [x] `scripts/venue-policies-2026-09-17.sql` — audit + recreate venues policies via
      is_org_member / is_org_admin; RESULTS table (David pastes into SQL editor)
- [x] `page.tsx` — replace venueUrlMap builder with `attachVenueDetails()`
- [x] `projects-client.tsx` — drop VenueUrlMap; use venue-helpers on `venue_details`
- [x] `send-gig-details-dialog.tsx` — preview renders linked name + address + venue 2
      via the same helpers the email uses
- [x] Test: preview formatting for linked vs unlinked venue
- [x] `npm test`, `npx tsc --noEmit`, `npm run build`
- [x] Browser check on Johann Kurtz project (preview + project card), screenshots
- [x] ONE push to master (0a93f213, live 19:41Z) + one follow-up for the dialog state leak found in the browser check
- [x] Update memory `project_venue_join_rls_bug.md` with the real cause
- [x] Lessons entry

## Open for David
- Resend gig details to the 4 Johann Kurtz players (gig Sept 18)?
- Whittemore House (Oct 11) still has no venue record.

## Verified live (2026-09-17, production, PSQ login)
- Iavor → Send Gig Details preview: "Venue: Jewel Box" with "St. Louis, MO, 63110" beneath,
  matching the project row. Nothing was sent (Cancel).
- Found while checking: opening the dialog for an unsent project after a sent one kept the
  previous project's "everyone confirmed" list. Fixed (state reset in checkExistingSends).

## Still on David
- Paste `scripts/venue-policies-2026-09-17.sql` into the Supabase SQL editor (unlocks
  Saved Venues in the picker + the Venues page). All RESULTS rows should say PASS.
