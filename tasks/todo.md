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
