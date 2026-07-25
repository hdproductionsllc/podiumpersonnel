-- ============================================================================
-- PODIUM — SECURITY FIXES (2026-07-25)
--
-- HOW TO RUN
--   1. Back up first, from your terminal:   node scripts/backup-database.js
--   2. Supabase Dashboard -> SQL Editor -> New query
--   3. Paste this ENTIRE file -> Run
--   4. Read the "RESULTS" table printed at the very bottom. It tells you in
--      plain English whether each part worked.
--
-- Safe to run more than once. Running it twice changes nothing the second time.
--
-- WHAT IT DOES
--   PART 1 (urgent) - Closes a hole where anyone on the internet could read and
--                     change your gig-confirmation records for EVERY customer.
--   PART 2 (important, not urgent) - Stops one login from joining two
--                     organizations, which silently breaks that person's account.
--
-- PART 2 will SKIP ITSELF (with a warning) if any account already belongs to two
-- organizations, rather than guessing which one to delete. Part 1 still applies
-- either way. If it skips, send David's message to Claude and we'll sort it out.
-- ============================================================================


-- ============================================================================
-- PART 1 — Close the public read/write hole on the gig-detail tables
--
-- Migration 039 created these two policies to "let the service role through":
--
--   CREATE POLICY "Service role full access to gig_detail_sends"
--     ON gig_detail_sends FOR ALL USING (true) WITH CHECK (true);
--
-- A policy with no TO clause applies to PUBLIC - every role, including `anon`.
-- Supabase grants `anon` table privileges on the public schema by default and
-- relies on RLS as the only gate, so USING (true) exposed both tables in full to
-- anyone holding the anon key, which ships in every browser bundle by design.
--
-- gig_detail_confirmations stores the per-musician confirmation TOKEN, so a
-- reader could page the whole table, harvest every token across every
-- organization, and then drive /confirm-details/[token] for each one - marking
-- gigs confirmed on musicians' behalf and firing an admin email per hit. Write
-- access also allowed blanking confirmed_at or deleting rows outright.
--
-- The policies were never needed: the service role BYPASSES RLS, so the token
-- routes keep working with no policy at all. Migration 041 already used the
-- correct org-scoped shape for the equivalent music_sends / music_confirmations
-- tables; this brings 039's tables in line with it.
-- ============================================================================

-- 1a. Drop the two public-access policies.
DROP POLICY IF EXISTS "Service role full access to gig_detail_sends"         ON gig_detail_sends;
DROP POLICY IF EXISTS "Service role full access to gig_detail_confirmations" ON gig_detail_confirmations;

-- 1b. RLS must be ON. With the permissive policies gone and no policy matching a
--     given role, Postgres denies by default - which is what we want for `anon`.
ALTER TABLE gig_detail_sends         ENABLE ROW LEVEL SECURITY;
ALTER TABLE gig_detail_confirmations ENABLE ROW LEVEL SECURITY;

-- 1c. Org members keep read access to confirmations, scoped through the parent
--     send's organization_id (mirroring migration 041). Without this the
--     admin-facing "who has confirmed?" view would lose its data.
DROP POLICY IF EXISTS "Org members can view gig detail confirmations" ON gig_detail_confirmations;
CREATE POLICY "Org members can view gig detail confirmations"
  ON gig_detail_confirmations FOR SELECT
  USING (send_id IN (
    SELECT id FROM gig_detail_sends WHERE organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  ));

-- No INSERT/UPDATE/DELETE policy is defined on purpose. Every write path
-- (sending gig details, confirming via token) runs through the service-role
-- client in an API route that authorizes the caller itself, and the service role
-- is not subject to RLS. Adding write policies would only re-open surface area.


-- ============================================================================
-- PART 2 — One organization per account
--
-- ~38 API routes resolve the caller's org with
--     .from('organization_members').select(...).eq('user_id', user.id).single()
-- and .single() returns NO row when it matches TWO. So an account with a second
-- membership gets "No organization found" from all of them - while the dashboard
-- shell (hardened separately to pick the first membership) still renders. The
-- result is a healthy-looking UI where every action fails.
--
-- The existing UNIQUE(organization_id, user_id) does not prevent this: it allows
-- one row PER ORG, which is exactly the two rows that cause the breakage.
--
-- This block SKIPS ITSELF if the data already violates the rule, so Part 1 above
-- still lands. It never deletes anything - choosing which membership to discard
-- could remove an owner from the org they actually run.
-- ============================================================================

DO $$
DECLARE
  v_offenders TEXT;
  v_count     INT;
BEGIN
  SELECT count(*), string_agg(user_id::text || ' (' || n || ' orgs)', ', ')
    INTO v_count, v_offenders
  FROM (
    SELECT user_id, count(*) AS n
    FROM organization_members
    GROUP BY user_id
    HAVING count(*) > 1
  ) dupes;

  IF v_count > 0 THEN
    RAISE WARNING '=======================================================';
    RAISE WARNING 'PART 2 SKIPPED - not applied.';
    RAISE WARNING '% account(s) already belong to more than one organization:', v_count;
    RAISE WARNING '  %', v_offenders;
    RAISE WARNING 'Part 1 (the urgent security fix) DID apply successfully.';
    RAISE WARNING 'Send this message to Claude to decide which membership each';
    RAISE WARNING 'account keeps. Nothing has been deleted.';
    RAISE WARNING '=======================================================';
  ELSE
    -- Data is clean. Enforce the rule from here on.
    ALTER TABLE organization_members
      DROP CONSTRAINT IF EXISTS organization_members_user_id_key;

    ALTER TABLE organization_members
      ADD CONSTRAINT organization_members_user_id_key UNIQUE (user_id);

    RAISE NOTICE 'PART 2 applied - one organization per account is now enforced.';
  END IF;
END $$;


-- ============================================================================
-- RESULTS — read this table. Both rows should say PASS.
-- ============================================================================

SELECT
  'PART 1: gig-detail hole closed' AS check,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename IN ('gig_detail_sends','gig_detail_confirmations')
      AND 'public' = ANY(roles)
      AND qual = 'true'
  ) THEN 'PASS - no public policy remains'
    ELSE 'FAIL - a public policy is still present, tell Claude'
  END AS result

UNION ALL

SELECT
  'PART 1: RLS switched on',
  CASE WHEN (
    SELECT bool_and(relrowsecurity) FROM pg_class
    WHERE relname IN ('gig_detail_sends','gig_detail_confirmations')
  ) THEN 'PASS - row security enabled on both tables'
    ELSE 'FAIL - row security is off somewhere, tell Claude'
  END

UNION ALL

SELECT
  'PART 2: one org per account',
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'organization_members'::regclass
        AND conname  = 'organization_members_user_id_key'
    ) THEN 'PASS - rule is enforced by the database'
    WHEN EXISTS (
      SELECT 1 FROM (
        SELECT user_id FROM organization_members
        GROUP BY user_id HAVING count(*) > 1
      ) d
    ) THEN 'SKIPPED - an account is in two orgs (see warnings above), tell Claude'
    ELSE 'FAIL - not applied and no duplicates found, tell Claude'
  END

UNION ALL

SELECT
  'Accounts currently in two orgs',
  COALESCE((
    SELECT count(*)::text FROM (
      SELECT user_id FROM organization_members
      GROUP BY user_id HAVING count(*) > 1
    ) d
  ), '0') || ' (should be 0)';
