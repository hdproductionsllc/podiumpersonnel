-- 076: Close the public read/write hole on the gig-detail tables
--
-- Migration 039 created these two policies to give API routes access:
--
--   CREATE POLICY "Service role full access to gig_detail_sends"
--     ON gig_detail_sends FOR ALL USING (true) WITH CHECK (true);
--
-- The intent was "let the service role through". The effect was the opposite of
-- intended: a policy with no TO clause applies to PUBLIC — every role, including
-- `anon`. And Supabase grants `anon` table privileges on the public schema by
-- default, with RLS as the only gate. So USING (true) meant anyone holding the
-- publishable anon key (it ships in every browser bundle, by design) could
-- SELECT, INSERT, UPDATE and DELETE every row in both tables, across all orgs.
--
-- The policies were never needed in the first place: the service role BYPASSES
-- RLS entirely, so /api/confirm-details/[token] and the send routes keep working
-- with no policy at all. Dropping them closes the hole and changes nothing about
-- how the app behaves.
--
-- Why this matters more than a normal leak: gig_detail_confirmations stores the
-- per-musician confirmation TOKEN. A reader could page the whole table, harvest
-- every token, and then drive /confirm-details/[token] for every musician in
-- every organization — marking gigs confirmed on their behalf and firing an
-- admin notification email for each one. Write access also let anyone blank
-- confirmed_at (erasing a contractor's tracking) or delete rows outright.
--
-- Migration 041 already established the correct pattern for exactly this shape
-- of table (music_sends / music_confirmations): org-scoped SELECT for members,
-- no public policy, service role bypassing RLS for the token routes. This
-- migration brings 039's tables in line with 041's.
--
-- Idempotent and safe to re-run.

-- 1. Drop the two public-access policies.
DROP POLICY IF EXISTS "Service role full access to gig_detail_sends"        ON gig_detail_sends;
DROP POLICY IF EXISTS "Service role full access to gig_detail_confirmations" ON gig_detail_confirmations;

-- 2. RLS must be ON. With the permissive policies gone and no policy matching a
--    given role, Postgres denies by default — which is what we want for `anon`.
ALTER TABLE gig_detail_sends         ENABLE ROW LEVEL SECURITY;
ALTER TABLE gig_detail_confirmations ENABLE ROW LEVEL SECURITY;

-- 3. Org members keep read access to confirmations (the sends-level SELECT policy
--    from 039 already covers gig_detail_sends). Without this, the admin-facing
--    "who has confirmed?" view would lose its data when read via a user session.
--    Scoped through the parent send's organization_id, mirroring 041.
DROP POLICY IF EXISTS "Org members can view gig detail confirmations" ON gig_detail_confirmations;
CREATE POLICY "Org members can view gig detail confirmations"
  ON gig_detail_confirmations FOR SELECT
  USING (send_id IN (
    SELECT id FROM gig_detail_sends WHERE organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  ));

-- Note: no INSERT/UPDATE/DELETE policy is defined for either table on purpose.
-- Every write path (sending gig details, confirming via token) runs through the
-- service-role client in an API route that authorizes the caller itself, and the
-- service role is not subject to RLS. Adding write policies here would only
-- re-open surface area.

-- verify: no public/permissive policy survives on either table. Expect 0 rows.
-- SELECT tablename, policyname, roles, cmd, qual
-- FROM pg_policies
-- WHERE tablename IN ('gig_detail_sends','gig_detail_confirmations')
--   AND 'public' = ANY(roles)
--   AND qual = 'true';

-- verify: what IS still there, and that each policy is org-scoped. Expect only
-- the org-member SELECT policies.
-- SELECT tablename, policyname, cmd, roles, qual, with_check
-- FROM pg_policies
-- WHERE tablename IN ('gig_detail_sends','gig_detail_confirmations')
-- ORDER BY tablename, policyname;

-- verify: RLS is actually enabled on both (a policy is worthless without it).
-- Expect relrowsecurity = true for both rows.
-- SELECT relname, relrowsecurity
-- FROM pg_class
-- WHERE relname IN ('gig_detail_sends','gig_detail_confirmations');
