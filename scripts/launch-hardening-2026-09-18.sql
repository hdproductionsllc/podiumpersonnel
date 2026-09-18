-- ============================================================================
-- PODIUM — LAUNCH HARDENING (2026-09-18)
-- Applies migrations 084, 085 and 086 in one paste.
--
-- HOW TO RUN
--   1. Supabase Dashboard -> SQL Editor -> New query
--   2. Paste this ENTIRE file -> Run
--   3. Read the "RESULTS" table printed at the very bottom. Every row should
--      say PASS. If one says FAIL, paste the whole output back to Claude.
--
-- Safe to run more than once. Running it twice changes nothing the second time.
-- It never reads, changes or deletes a single row of your data — only the
-- permission rules (and it does not move or touch any uploaded file).
--
-- WHAT IT FIXES, in plain English
--
--   084 — Anyone with a Podium login could make themselves the OWNER of someone
--         else's account. The rule that let a new signup record their own
--         membership never said "…in your own organization", so a stranger could
--         point it at your organization instead. Nothing in the app uses that
--         rule (new orgs are created by a privileged database function, and
--         adding a team member goes through the admin key), so it just goes.
--
--   085 — The music/PDF bucket for projects was readable AND deletable by every
--         logged-in user of every account. The rules only asked "are you signed
--         in?", not "is this your organization's folder?". Files are stored as
--         <organization id>/<project id>/<file>.pdf, so the new rules check that
--         first folder: members may read their own org's files, admins may add
--         and remove them, nobody sees anyone else's. Your shared music library
--         is NOT in this bucket (it lives on Cloudflare R2), so sharing one
--         library across brands is unaffected.
--
--   086 — The venues fix from 2026-09-17, landed permanently. Same SQL you
--         already pasted; running it again is a no-op. Without it, any rebuilt
--         environment would come back with an empty Venues page.
-- ============================================================================


-- ============================================================================
-- PART 0 — What is there right now (for the record; nothing changes here)
-- ============================================================================

SELECT 'BEFORE' AS stage, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('organization_members', 'venues')
   OR (schemaname = 'storage' AND tablename = 'objects'
       AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%project-files%')
ORDER BY tablename, policyname;


-- ============================================================================
-- PART 1 — 084: drop the self-service membership INSERT policy
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert their own membership" ON organization_members;

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- PART 2 — 085: scope the project-files bucket to the owning organization
--
-- The CASE wrapper is not decoration: casting a non-uuid folder name straight
-- to uuid would raise an error inside the policy instead of simply denying, and
-- Postgres may reorder a plain AND guard. CASE fixes the order; a non-uuid
-- folder becomes NULL, and is_org_member(NULL) is false.
-- ============================================================================

DROP POLICY IF EXISTS "Org admins upload project files"          ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users read project files"   ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users delete project files" ON storage.objects;
DROP POLICY IF EXISTS "Org members read project files"           ON storage.objects;
DROP POLICY IF EXISTS "Org admins delete project files"          ON storage.objects;

CREATE POLICY "Org admins upload project files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'project-files'
  AND is_org_admin(
    (CASE
       WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       THEN (storage.foldername(name))[1]
     END)::uuid
  )
);

CREATE POLICY "Org members read project files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'project-files'
  AND is_org_member(
    (CASE
       WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       THEN (storage.foldername(name))[1]
     END)::uuid
  )
);

CREATE POLICY "Org admins delete project files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'project-files'
  AND is_org_admin(
    (CASE
       WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       THEN (storage.foldername(name))[1]
     END)::uuid
  )
);


-- ============================================================================
-- PART 3 — 086: venues policies on the is_org_member / is_org_admin helpers
-- ============================================================================

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


-- ============================================================================
-- RESULTS — read this table. Every row should say PASS.
-- ============================================================================

-- 084
SELECT
  'nobody can add themselves to an org (084)' AS check_name,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'organization_members'
      AND policyname = 'Users can insert their own membership'
  ) THEN 'PASS' ELSE 'FAIL - the open rule is still there, tell Claude' END AS result
UNION ALL
SELECT
  'every membership rule names an organization (084)',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'organization_members'
      AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%organization_id%'
  ) THEN 'PASS' ELSE 'FAIL - an unbound rule survives, tell Claude' END
UNION ALL
SELECT
  'admins can still manage their own members (084)',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'organization_members'
      AND policyname = 'Admins can manage organization members'
      AND qual LIKE '%is_org_admin%'
  ) THEN 'PASS' ELSE 'FAIL - migration 019 rule missing, tell Claude' END
UNION ALL
SELECT
  'row security is on for organization_members (084)',
  CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE relname = 'organization_members')
  THEN 'PASS' ELSE 'FAIL - tell Claude' END

-- 085
UNION ALL
SELECT
  'project files: three rules, all folder-scoped (085)',
  CASE WHEN (
    SELECT count(*) FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%project-files%'
      AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%foldername%'
  ) = 3 THEN 'PASS' ELSE 'FAIL - a project-files rule is missing or unscoped, tell Claude' END
UNION ALL
SELECT
  'project files: no "any logged-in user" rule left (085)',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%project-files%'
      AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%foldername%'
  ) THEN 'PASS' ELSE 'FAIL - an unscoped rule survived, tell Claude' END
UNION ALL
SELECT
  'project files: reads need membership, writes need admin (085)',
  CASE WHEN (
    SELECT count(*) FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%project-files%'
      AND (
        (cmd = 'SELECT' AND qual LIKE '%is_org_member%')
        OR (cmd = 'INSERT' AND with_check LIKE '%is_org_admin%')
        OR (cmd = 'DELETE' AND qual LIKE '%is_org_admin%')
      )
  ) = 3 THEN 'PASS' ELSE 'FAIL - wrong helper on one of the rules, tell Claude' END
UNION ALL
SELECT
  'project files bucket is private (085)',
  CASE WHEN (SELECT NOT public FROM storage.buckets WHERE id = 'project-files')
  THEN 'PASS' ELSE 'FAIL - the bucket is public, tell Claude' END
UNION ALL
SELECT
  'every stored project file sits in an org folder (085)',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'project-files'
      AND (storage.foldername(name))[1]
          !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN 'PASS' ELSE 'WARN - an old file is not under an org folder; it stays reachable through the app but not directly. Tell Claude.' END

-- 086
UNION ALL
SELECT
  'org members can read venues (086)',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'venues' AND cmd = 'SELECT'
      AND policyname = 'Users can view venues in their organization'
      AND qual LIKE '%is_org_member%'
  ) THEN 'PASS' ELSE 'FAIL - read rule missing, tell Claude' END
UNION ALL
SELECT
  'admins can add / edit / delete venues (086)',
  CASE WHEN (
    SELECT count(*) FROM pg_policies
    WHERE tablename = 'venues' AND cmd IN ('INSERT','UPDATE','DELETE')
      AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%is_org_admin%'
  ) = 3 THEN 'PASS' ELSE 'FAIL - a write rule is missing, tell Claude' END
UNION ALL
SELECT
  'musicians can still read venues (portal) (086)',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'venues' AND policyname = 'Musicians can view venues'
  ) THEN 'PASS' ELSE 'WARN - musician read rule absent (migration 034 never ran?)' END
UNION ALL
SELECT
  'no venues rule with the old raw sub-select (086)',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'venues'
      AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%organization_members%'
  ) THEN 'PASS' ELSE 'FAIL - an old rule survived, tell Claude' END
UNION ALL
SELECT
  'row security is on for venues (086)',
  CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE relname = 'venues')
  THEN 'PASS' ELSE 'FAIL - tell Claude' END

-- helpers these rules depend on
UNION ALL
SELECT
  'helper is_org_member exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_org_member')
  THEN 'PASS' ELSE 'FAIL - helper missing, nothing above will work. Tell Claude.' END
UNION ALL
SELECT
  'helper is_org_admin exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_org_admin')
  THEN 'PASS' ELSE 'FAIL - helper missing, nothing above will work. Tell Claude.' END
UNION ALL
SELECT
  'org-creation function is still privileged',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'create_organization_with_owner' AND prosecdef
  ) THEN 'PASS' ELSE 'FAIL - signup would break without this, tell Claude' END;
