# Gig-details preview shows bare venue name (2026-09-17)

## Diagnosis (verified with a real user session, not a grep)
- Admin login sees 0 rows in `venues` (admin key sees 16 in PSQ). Projects, members,
  musicians all read fine → the `venues` RLS policy from migration 003 is the fault.
- Preview dialog reads venue through the user session → null → bare text.
- Email itself uses the admin key → includes address + map link when the gig is linked.
- Sept 15 Johann Kurtz batch went out bare because the gig was unlinked at the time.

## Tasks
- [ ] `scripts/venue-policies-2026-09-17.sql` — audit + recreate venues policies via
      is_org_member / is_org_admin; RESULTS table (David pastes into SQL editor)
- [ ] `page.tsx` — replace venueUrlMap builder with `attachVenueDetails()`
- [ ] `projects-client.tsx` — drop VenueUrlMap; use venue-helpers on `venue_details`
- [ ] `send-gig-details-dialog.tsx` — preview renders linked name + address + venue 2
      via the same helpers the email uses
- [ ] Test: preview formatting for linked vs unlinked venue
- [ ] `npm test`, `npx tsc --noEmit`, `npm run build`
- [ ] Browser check on Johann Kurtz project (preview + project card), screenshots
- [ ] ONE push to master
- [ ] Update memory `project_venue_join_rls_bug.md` with the real cause
- [ ] Lessons entry

## Open for David
- Resend gig details to the 4 Johann Kurtz players (gig Sept 18)?
- Whittemore House (Oct 11) still has no venue record.
