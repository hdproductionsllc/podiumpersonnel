-- ============================================================================
-- PODIUM — TENANT HARDENING (migration 091, 2026-10-02)
--
-- HOW TO RUN
--   1. Supabase Dashboard -> SQL Editor -> New query
--   2. Paste this ENTIRE file -> Run
--   3. Read the "RESULTS" table printed at the very bottom. Every row should
--      say PASS (one INFO row just reports a number). If one says FAIL, paste
--      the whole output back to Claude.
--
-- Safe to run more than once: the second run changes nothing. It runs inside
-- one transaction, so if any statement errors NOTHING is applied — paste the
-- error back to Claude. It never changes or deletes a row of your data (the
-- last results row only counts some); it changes permission rules and who may
-- call a few database functions.
--
-- Can be run before or after the matching code deploy; either order is safe.
--
-- WHAT IT FIXES, in plain English
--
--   The old "musician portal" (musicians logging in to Podium) was retired when
--   musicians moved to emailed links. Its permission rules were never removed.
--   One of them let a musician who had ever been linked to a login edit their
--   whole roster row — including WHICH ORGANIZATION it belongs to. Moving it
--   to someone else's organization would then let them read that
--   organization's account details, instruments and venues. This removes every
--   portal rule. Nothing in the app uses them: musician pages run on the
--   emailed links, and staff use their own (unchanged) rules.
--
--   Also:
--   - any logged-in user could create organization rows directly with
--     comped / plan settings of their choosing (they could not join them, but
--     the rule is unnecessary — signup uses a protected function);
--   - anyone could write impersonation-log rows against any organization;
--   - three old portal functions were still callable from the browser;
--   - the protected functions now pin where they look up tables (a standard
--     Supabase security warning).
--
-- The two launch-assessment holes (anyone joining any org; the project-files
-- bucket) were fixed by migrations 084/085 in scripts/launch-hardening-2026-09-18.sql.
-- The RESULTS table re-checks them. If those rows FAIL, run that script too.
--
-- Body below is supabase/migrations/091_tenant_hardening.sql, copied verbatim.
-- ============================================================================

BEGIN;

-- 091: Tenant hardening — retire the musician-portal permissions
--
-- THE HOLE (architecture audit B, finding T-1, HIGH)
--   Migration 016 created "Musicians can update own contact info" on musicians:
--
--     FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())
--
--   with no column restriction. Any account linked to a roster row (by
--   link_musician_records_to_user, which any signed-in user may call for their
--   own verified email) could therefore run
--
--     UPDATE musicians SET organization_id = '<another org>' WHERE user_id = auth.uid()
--
--   through PostgREST. get_musician_org_ids() would then return the other org,
--   and the 034 portal policies would hand that account the other org's
--   organizations row (billing columns included), instruments and venues. The
--   same policy let a linked musician rewrite call_order, is_leader,
--   w9_verified_at/by, notes, tags and email_status on their own row.
--
-- WHY THE WHOLE PORTAL LAYER GOES, NOT JUST THAT ONE POLICY
--   Since 078 the musician experience is token-based (/gig, /w9, /confirm-*,
--   /report) and runs on the service role. There is no /musician route any more;
--   the auth callback's redirect there was a 404 and is removed in the same
--   change. Every policy below keys on musicians.user_id = auth.uid(), directly
--   or through the 034 helpers, and no live code path reads through one:
--     - the gig page reads musician.user_id with the SERVICE client
--       (isOrgStaffPreviewing), which bypasses RLS — the column stays;
--     - downloads are recorded by the service client
--       (/api/music-download, files/[fileId]/download);
--     - nothing reads musician_notification_preferences, contract_offers,
--       substitution_requests, projects, services or positions as a musician.
--   Production on 2026-10-02 (read-only): 5 of 425 musicians carry a user_id,
--   all in one org, held by 4 accounts. 3 have no organization (portal-era,
--   last sign-in Feb-Jul 2026) and today land on a 404 after login; 1 is the
--   owner of a different org, whose own dashboard runs on its membership and is
--   unaffected. impersonation_log has 0 rows.
--
-- ALSO (audit B T-3, T-4, T-5)
--   T-3  activate_musician_by_token / get_musician_by_invite_token are portal
--        DEFINER functions still executable by anon. Nothing calls them.
--        link_musician_records_to_user's only caller was the callback branch
--        removed with this migration. All three lose client EXECUTE; the
--        service role keeps it. Every SECURITY DEFINER function gets a pinned
--        search_path (the Supabase linter warning), matching 080/081.
--   T-4  organizations INSERT (018) let any signed-in user insert org rows with
--        arbitrary is_comped / plan_tier / library_org_id. Onboarding uses the
--        create_organization_with_owner DEFINER RPC, which is not subject to it.
--   T-5  impersonation_log INSERT checked only admin_user_id = auth.uid(), so
--        anyone could write log rows against any organization.
--
-- NOT HERE, ON PURPOSE
--   The launch-assessment holes A1 (org_members self-insert) and A2
--   (project-files bucket) are already fixed by migrations 084 and 085. The
--   paste script for this migration re-checks that they are live.
--   musicians.user_id itself is kept: the gig page reads it, and dropping a
--   column is not a permission change.
--
-- Idempotent and safe to re-run. It changes no rows — only permission rules,
-- function grants and function settings.


-- 1. musicians: the portal's own-row policies (016).
--    "Musicians can update own contact info" is T-1 itself. "Musicians can view
--    own musician records" let a linked account read its rows in every org; staff
--    read musicians through "Members can view musicians" (001, is_org_member)
--    and write through "Admins can manage musicians" (001, is_org_admin); both
--    are unchanged.
DROP POLICY IF EXISTS "Musicians can update own contact info"   ON musicians;
DROP POLICY IF EXISTS "Musicians can view own musician records" ON musicians;

-- 2. musician_notification_preferences: portal self-service (016). No code reads
--    or writes the table; the admin read policy stays.
DROP POLICY IF EXISTS "Musicians can view own notification preferences"   ON musician_notification_preferences;
DROP POLICY IF EXISTS "Musicians can update own notification preferences" ON musician_notification_preferences;
DROP POLICY IF EXISTS "Musicians can insert own notification preferences" ON musician_notification_preferences;

-- 3. The 034 portal reads, scoped through get_musician_*() — i.e. through
--    musicians.user_id. The org-move in T-1 is what turned the last three into a
--    cross-tenant read; the first four exposed only the musician's own gigs, to a
--    portal that no longer exists. Staff read every one of these tables through
--    is_org_member(), which is unchanged.
DROP POLICY IF EXISTS "Musicians can view own positions"    ON project_positions;
DROP POLICY IF EXISTS "Musicians can view own projects"     ON projects;
DROP POLICY IF EXISTS "Musicians can view own services"     ON services;
DROP POLICY IF EXISTS "Musicians can view own offers"       ON contract_offers;
DROP POLICY IF EXISTS "Musicians can view own organization" ON organizations;
DROP POLICY IF EXISTS "Musicians can view instruments"      ON instruments;
DROP POLICY IF EXISTS "Musicians can view venues"           ON venues;

-- 4. substitution_requests: the portal's "my sub requests" read (035). Sub
--    requests are created and answered through token pages on the service role.
DROP POLICY IF EXISTS "Musicians can view own sub requests" ON substitution_requests;

-- 5. project_file_downloads: the portal's self-reported download (041). Both
--    download routes record the row with the service client.
DROP POLICY IF EXISTS "Musicians can insert own downloads" ON project_file_downloads;

-- 6. organizations INSERT (018, T-4). New organizations come only from
--    create_organization_with_owner (SECURITY DEFINER, runs as its owner, so no
--    policy is needed for it). Without this policy the table has no INSERT path
--    for a client at all, which is the point.
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON organizations;

-- 7. impersonation_log INSERT (028, T-5): the writer must be an admin of the
--    organization the row is filed under, not merely the person named in it.
DROP POLICY IF EXISTS "Authenticated users can insert impersonation logs" ON impersonation_log;
DROP POLICY IF EXISTS "Admins can insert impersonation logs"              ON impersonation_log;

CREATE POLICY "Admins can insert impersonation logs"
  ON impersonation_log FOR INSERT
  WITH CHECK (admin_user_id = auth.uid() AND is_org_admin(organization_id));

-- 8. Portal DEFINER functions (T-3): no client may call them. Supabase grants
--    EXECUTE to anon and authenticated explicitly on new functions, so revoking
--    PUBLIC alone would leave them reachable. service_role keeps EXECUTE.
REVOKE ALL ON FUNCTION activate_musician_by_token(UUID, TEXT)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION get_musician_by_invite_token(TEXT)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION link_musician_records_to_user(UUID, TEXT)  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION activate_musician_by_token(UUID, TEXT)    TO service_role;
GRANT EXECUTE ON FUNCTION get_musician_by_invite_token(TEXT)        TO service_role;
GRANT EXECUTE ON FUNCTION link_musician_records_to_user(UUID, TEXT) TO service_role;

-- 9. Pin search_path on every SECURITY DEFINER function that lacks one. A
--    DEFINER function resolves unqualified names through the CALLER's
--    search_path, so a caller who can create objects earlier on that path could
--    substitute their own table or function and have it run with the owner's
--    rights. Same setting as 080/081. Column defaults (uuid_generate_v4) were
--    resolved when the tables were created and are unaffected; every body here
--    names auth.* explicitly.
--    The get_musician_*() helpers are now referenced by no policy; they stay
--    (they only ever return the caller's own rows) so that an unexpected
--    hand-made dependency cannot fail this migration. Drop them later.
ALTER FUNCTION is_org_member(UUID)                                   SET search_path = public, pg_temp;
ALTER FUNCTION is_org_admin(UUID)                                    SET search_path = public, pg_temp;
ALTER FUNCTION create_organization_with_owner(TEXT, TEXT, TEXT, TEXT) SET search_path = public, pg_temp;
ALTER FUNCTION link_musician_records_to_user(UUID, TEXT)             SET search_path = public, pg_temp;
ALTER FUNCTION activate_musician_by_token(UUID, TEXT)                SET search_path = public, pg_temp;
ALTER FUNCTION get_musician_by_invite_token(TEXT)                    SET search_path = public, pg_temp;
ALTER FUNCTION get_musician_ids_for_auth_user()                      SET search_path = public, pg_temp;
ALTER FUNCTION get_musician_project_ids()                            SET search_path = public, pg_temp;
ALTER FUNCTION get_musician_org_ids()                                SET search_path = public, pg_temp;

-- verify: no policy keys on a musician's own account any more. Expect 0 rows.
-- (organization_members policies also say user_id = auth.uid(); that is the
-- staff membership, not musicians.user_id, so the musicians check is by table.)
-- SELECT tablename, policyname FROM pg_policies
-- WHERE schemaname = 'public'
--   AND (coalesce(qual,'') || coalesce(with_check,'') ~ 'get_musician_|musicians\.user_id'
--        OR (tablename = 'musicians' AND coalesce(qual,'') || coalesce(with_check,'') LIKE '%user_id%'));

-- verify: every SECURITY DEFINER function in public pins search_path. Expect 0 rows.
-- SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.prosecdef
--   AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%');

COMMIT;


-- ============================================================================
-- RESULTS — read this table. Every row should say PASS.
-- ============================================================================

-- T-1: the roster row can no longer be edited from a musician login
SELECT
  'a musician login cannot edit or read roster rows (T-1)' AS check_name,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'musicians'
      AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%user_id%'
  ) THEN 'PASS' ELSE 'FAIL - a musician-login rule survives on musicians, tell Claude' END AS result
UNION ALL
SELECT
  'no permission rule anywhere keys on a musician login (portal)',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND coalesce(qual, '') || coalesce(with_check, '') ~ 'get_musician_|musicians\.user_id'
  ) THEN 'PASS' ELSE 'FAIL - ' || (
    SELECT string_agg(tablename || ': ' || policyname, '; ')
    FROM pg_policies
    WHERE schemaname = 'public'
      AND coalesce(qual, '') || coalesce(with_check, '') ~ 'get_musician_|musicians\.user_id'
  ) || ' - tell Claude' END
UNION ALL
SELECT
  'staff can still read and manage their roster',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'musicians' AND policyname = 'Members can view musicians'
      AND qual LIKE '%is_org_member%'
  ) AND EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'musicians' AND policyname = 'Admins can manage musicians'
      AND qual LIKE '%is_org_admin%'
  ) THEN 'PASS' ELSE 'FAIL - a staff roster rule is missing, tell Claude' END
UNION ALL
SELECT
  'staff can still see their own organization',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'organizations' AND policyname = 'Members can view their organization'
      AND qual LIKE '%is_org_member%'
  ) THEN 'PASS' ELSE 'FAIL - the organization read rule is missing, tell Claude' END
UNION ALL
SELECT
  'staff can still read venues (086)',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'venues' AND cmd = 'SELECT'
      AND policyname = 'Users can view venues in their organization'
      AND qual LIKE '%is_org_member%'
  ) THEN 'PASS' ELSE 'FAIL - venue read rule missing, run scripts/launch-hardening-2026-09-18.sql' END

-- T-4
UNION ALL
SELECT
  'nobody can create an organization row directly (T-4)',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'organizations' AND cmd IN ('INSERT', 'ALL')
  ) THEN 'PASS' ELSE 'FAIL - an insert rule survives on organizations, tell Claude' END
UNION ALL
SELECT
  'signup can still create an organization',
  CASE WHEN has_function_privilege(
    'authenticated', 'create_organization_with_owner(text, text, text, text)', 'EXECUTE'
  ) THEN 'PASS' ELSE 'FAIL - signup would break, tell Claude NOW' END

-- T-5
UNION ALL
SELECT
  'impersonation log: only an org admin can write (T-5)',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'impersonation_log' AND cmd = 'INSERT'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'impersonation_log' AND cmd IN ('INSERT', 'ALL')
      AND coalesce(with_check, '') NOT LIKE '%is_org_admin%'
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END

-- T-3
UNION ALL
SELECT
  'old portal functions cannot be called from the browser (T-3)',
  CASE WHEN NOT (
       has_function_privilege('anon',          'activate_musician_by_token(uuid, text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'activate_musician_by_token(uuid, text)', 'EXECUTE')
    OR has_function_privilege('anon',          'get_musician_by_invite_token(text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'get_musician_by_invite_token(text)', 'EXECUTE')
    OR has_function_privilege('anon',          'link_musician_records_to_user(uuid, text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'link_musician_records_to_user(uuid, text)', 'EXECUTE')
  ) THEN 'PASS' ELSE 'FAIL - a portal function is still callable, tell Claude' END
UNION ALL
SELECT
  'every protected function pins its search path',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
  ) THEN 'PASS' ELSE 'FAIL - not pinned: ' || (
    SELECT string_agg(p.oid::regprocedure::text, ', ')
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
  ) || ' - tell Claude' END
UNION ALL
SELECT
  'row security is on for musicians, organizations, impersonation_log',
  CASE WHEN (
    SELECT bool_and(relrowsecurity) FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname IN ('musicians', 'organizations', 'impersonation_log')
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END

-- Re-check of the two launch-assessment holes (084, 085)
UNION ALL
SELECT
  'nobody can add themselves to an org (084)',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'organization_members'
      AND policyname = 'Users can insert their own membership'
  ) THEN 'PASS' ELSE 'FAIL - run scripts/launch-hardening-2026-09-18.sql' END
UNION ALL
SELECT
  'every membership rule names an organization (084)',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'organization_members'
      AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%organization_id%'
  ) THEN 'PASS' ELSE 'FAIL - run scripts/launch-hardening-2026-09-18.sql' END
UNION ALL
SELECT
  'project files: three rules, all folder-scoped (085)',
  CASE WHEN (
    SELECT count(*) FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%project-files%'
      AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%foldername%'
  ) = 3 THEN 'PASS' ELSE 'FAIL - run scripts/launch-hardening-2026-09-18.sql' END
UNION ALL
SELECT
  'project files: no "any logged-in user" rule left (085)',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%project-files%'
      AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%foldername%'
  ) THEN 'PASS' ELSE 'FAIL - run scripts/launch-hardening-2026-09-18.sql' END

-- For information only: roster rows still carrying a login id. Harmless now —
-- no rule reads it. Expected 5 on 2026-10-02.
UNION ALL
SELECT
  'INFO: roster rows still linked to a login (no longer grants anything)',
  'INFO - ' || (SELECT count(*) FROM musicians WHERE user_id IS NOT NULL)::text;
