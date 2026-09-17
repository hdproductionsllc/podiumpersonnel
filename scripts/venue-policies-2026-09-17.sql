-- ============================================================================
-- PODIUM — LET ADMINS SEE THEIR OWN VENUES (2026-09-17)
--
-- HOW TO RUN
--   1. Supabase Dashboard -> SQL Editor -> New query
--   2. Paste this ENTIRE file -> Run
--   3. Read the "RESULTS" table printed at the very bottom. Every row should
--      say PASS. If one says FAIL, paste the whole output back to Claude.
--
-- Safe to run more than once. Running it twice changes nothing the second time.
-- It never deletes or changes any venue, gig, or project data — only the
-- permission rules on the venues table.
--
-- WHAT IT FIXES
--   When you are logged in, the app cannot read your venues list at all.
--   (Verified 2026-09-17: your login sees 0 venues; the admin key sees 16.)
--   That is why:
--     - the "Send gig details" preview shows only a venue NAME, no address
--     - the venue picker never lists your Saved Venues
--     - the Venues page comes up empty
--   The emails themselves are built with the admin key, which is why they DO
--   carry the address when the gig is linked to a venue record.
--
-- WHY
--   The venues permission rules were written in migration 003 with a raw
--   sub-select on organization_members. Every table added since uses the
--   is_org_member() / is_org_admin() helpers instead, and those all work for
--   you. This script rewrites the four venues rules to use the same helpers.
--   The musician-portal read rule from migration 034 is left exactly as is.
-- ============================================================================


-- ============================================================================
-- PART 0 — What is there right now (for the record; nothing changes here)
-- ============================================================================

SELECT 'BEFORE' AS stage, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'venues'
ORDER BY policyname;


-- ============================================================================
-- PART 1 — Replace the four organization rules on venues
-- ============================================================================

DROP POLICY IF EXISTS "Users can view venues in their organization" ON venues;
DROP POLICY IF EXISTS "Admins can insert venues" ON venues;
DROP POLICY IF EXISTS "Admins can update venues" ON venues;
DROP POLICY IF EXISTS "Admins can delete venues" ON venues;

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


-- ============================================================================
-- RESULTS — read this table. Every row should say PASS.
-- ============================================================================

SELECT
  'org members can read venues' AS check,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'venues' AND cmd = 'SELECT'
      AND policyname = 'Users can view venues in their organization'
      AND qual LIKE '%is_org_member%'
  ) THEN 'PASS' ELSE 'FAIL - read rule missing, tell Claude' END AS result
UNION ALL
SELECT
  'admins can add / edit / delete venues',
  CASE WHEN (
    SELECT count(*) FROM pg_policies
    WHERE tablename = 'venues' AND cmd IN ('INSERT','UPDATE','DELETE')
      AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%is_org_admin%'
  ) = 3 THEN 'PASS' ELSE 'FAIL - a write rule is missing, tell Claude' END
UNION ALL
SELECT
  'musicians can still read venues (portal)',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'venues' AND policyname = 'Musicians can view venues'
  ) THEN 'PASS' ELSE 'WARN - musician read rule absent (migration 034 never ran?)' END
UNION ALL
SELECT
  'no leftover rules with the old raw sub-select',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'venues'
      AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%organization_members%'
  ) THEN 'PASS' ELSE 'FAIL - an old rule survived, tell Claude' END
UNION ALL
SELECT
  'row security is on for venues',
  CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE relname = 'venues')
  THEN 'PASS' ELSE 'FAIL - tell Claude' END;
