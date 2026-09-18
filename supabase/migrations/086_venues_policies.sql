-- 086: Rewrite the venues policies on the is_org_member/is_org_admin helpers
--
-- THE BUG
--   Migration 003 wrote the four organization policies on venues with a raw
--   sub-select against organization_members instead of the helper functions
--   every table added since uses. Under a normal user session that sub-select
--   returns nothing — organization_members has its own RLS, so the inner read is
--   filtered before the outer one is decided — and the result is that a logged-in
--   admin can read ZERO venues. Verified in production 2026-09-17: the owner's
--   session saw 0 venues, the service role saw 16.
--
--   What that broke, all from the same root cause:
--     - the Venues page came up empty,
--     - the venue picker never listed Saved Venues,
--     - "Send gig details" previewed a venue NAME with no address (the email
--       itself is built with the service role, so it carried the address — the
--       preview and the email disagreed).
--
--   is_org_member()/is_org_admin() are SECURITY DEFINER, so their read of
--   organization_members is not filtered, which is exactly why every table from
--   001 onward uses them.
--
-- PROVENANCE
--   This is scripts/venue-policies-2026-09-17.sql landed as a numbered
--   migration. That script was written to be pasted into the SQL editor and was
--   applied by hand; without this file, any rebuild (staging, disaster recovery,
--   a fresh environment) replays 003 and reproduces the bug. The script stays in
--   scripts/ as the record of what was pasted.
--
--   The musician-portal read policy from migration 034 ("Musicians can view
--   venues", scoped through get_musician_org_ids()) is deliberately left alone.
--
-- Idempotent and safe to re-run. It touches no venue, gig or project data —
-- only the permission rules on the venues table.

DROP POLICY IF EXISTS "Users can view venues in their organization" ON venues;
DROP POLICY IF EXISTS "Admins can insert venues"                    ON venues;
DROP POLICY IF EXISTS "Admins can update venues"                    ON venues;
DROP POLICY IF EXISTS "Admins can delete venues"                    ON venues;

CREATE POLICY "Users can view venues in their organization"
  ON venues FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admins can insert venues"
  ON venues FOR INSERT
  WITH CHECK (is_org_admin(organization_id));

CREATE POLICY "Admins can update venues"
  ON venues FOR UPDATE
  USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));

CREATE POLICY "Admins can delete venues"
  ON venues FOR DELETE
  USING (is_org_admin(organization_id));

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

-- verify: four org policies, all on the helpers. Expect 4 rows plus migration
-- 034's "Musicians can view venues".
-- SELECT policyname, cmd, qual, with_check FROM pg_policies
-- WHERE tablename = 'venues' ORDER BY policyname;

-- verify: no venues policy still carries the raw sub-select. Expect 0 rows.
-- SELECT policyname FROM pg_policies
-- WHERE tablename = 'venues'
--   AND coalesce(qual,'') || coalesce(with_check,'') LIKE '%organization_members%';

-- verify: row security is on. Expect true.
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'venues';
