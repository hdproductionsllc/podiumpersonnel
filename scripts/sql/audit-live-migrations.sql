-- ============================================================================
-- PODIUM — WHICH DATABASE UPDATES ARE REALLY LIVE? (read-only check, 2026-10-05)
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste this ENTIRE file -> Run.
--   Then send Claude the whole RESULTS table.
--
-- READ-ONLY: it only LOOKS. It changes nothing, so it cannot break anything and
-- can be run any time.
--
-- WHY
--   Pasting migration 098 stopped because something migration 081 should have
--   installed (in August) is missing. Functions, triggers and security rules
--   cannot be seen from outside the database, so this lists, for every
--   database update from 067 to 097, whether each thing it creates is there.
--   One row per update: "PASS", or "MISSING:" and exactly what.
--   The last row says whether 081's protection is the safe kind (it must NOT be
--   "security definer", or it silently lets everything through).
-- ============================================================================

WITH expected(migration, item, present) AS (
  VALUES
  ('067', 'function create_organization_with_owner', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' AND p.proname = 'create_organization_with_owner')),
  ('068', 'rule "Admins can manage repertoire" on repertoire', EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'repertoire' AND policyname = 'Admins can manage repertoire')),
  ('068', 'rule "Admins can manage repertoire parts" on repertoire_parts', EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'repertoire_parts' AND policyname = 'Admins can manage repertoire parts')),
  ('068', 'rule "Admins can manage title aliases" on title_aliases', EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'title_aliases' AND policyname = 'Admins can manage title aliases')),
  ('068', 'rule "Members can view repertoire" on repertoire', EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'repertoire' AND policyname = 'Members can view repertoire')),
  ('068', 'rule "Members can view repertoire parts" on repertoire_parts', EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'repertoire_parts' AND policyname = 'Members can view repertoire parts')),
  ('068', 'rule "Members can view title aliases" on title_aliases', EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'title_aliases' AND policyname = 'Members can view title aliases')),
  ('068', 'trigger set_updated_at on repertoire', EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'set_updated_at' AND tgrelid = to_regclass('public.repertoire'))),
  ('068', 'trigger set_updated_at on repertoire_parts', EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'set_updated_at' AND tgrelid = to_regclass('public.repertoire_parts'))),
  ('068', 'trigger set_updated_at on title_aliases', EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'set_updated_at' AND tgrelid = to_regclass('public.title_aliases'))),
  ('069', 'rule "Admins can manage intake songs" on intake_songs', EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'intake_songs' AND policyname = 'Admins can manage intake songs')),
  ('069', 'rule "Admins can manage intakes" on intakes', EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'intakes' AND policyname = 'Admins can manage intakes')),
  ('069', 'rule "Members can view intake songs" on intake_songs', EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'intake_songs' AND policyname = 'Members can view intake songs')),
  ('069', 'rule "Members can view intakes" on intakes', EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'intakes' AND policyname = 'Members can view intakes')),
  ('069', 'trigger set_updated_at on intake_songs', EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'set_updated_at' AND tgrelid = to_regclass('public.intake_songs'))),
  ('069', 'trigger set_updated_at on intakes', EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'set_updated_at' AND tgrelid = to_regclass('public.intakes'))),
  ('072', 'trigger set_updated_at on spotify_connections', EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'set_updated_at' AND tgrelid = to_regclass('public.spotify_connections'))),
  ('074', 'function link_musician_records_to_user', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' AND p.proname = 'link_musician_records_to_user')),
  ('076', 'rule "Org members can view gig detail confirmations" on gig_detail_confirmations', EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'gig_detail_confirmations' AND policyname = 'Org members can view gig detail confirmations')),
  ('079', 'rule "Org members can view part versions" on repertoire_part_versions', EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'repertoire_part_versions' AND policyname = 'Org members can view part versions')),
  ('080', 'function enforce_musician_limit', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' AND p.proname = 'enforce_musician_limit')),
  ('080', 'function enforce_project_limit', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' AND p.proname = 'enforce_project_limit')),
  ('080', 'function org_plan_limit', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' AND p.proname = 'org_plan_limit')),
  ('080', 'function org_plan_tier', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' AND p.proname = 'org_plan_tier')),
  ('080', 'trigger trg_enforce_musician_limit on musicians', EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'trg_enforce_musician_limit' AND tgrelid = to_regclass('public.musicians'))),
  ('080', 'trigger trg_enforce_project_limit on projects', EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'trg_enforce_project_limit' AND tgrelid = to_regclass('public.projects'))),
  ('081', 'function protect_privileged_org_columns', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' AND p.proname = 'protect_privileged_org_columns')),
  ('081', 'trigger trg_protect_privileged_org_columns on organizations', EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'trg_protect_privileged_org_columns' AND tgrelid = to_regclass('public.organizations'))),
  ('085', 'rule "Org admins delete project files" on storage.objects', EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Org admins delete project files')),
  ('085', 'rule "Org admins upload project files" on storage.objects', EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Org admins upload project files')),
  ('085', 'rule "Org members read project files" on storage.objects', EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Org members read project files')),
  ('086', 'rule "Admins can delete venues" on venues', EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'venues' AND policyname = 'Admins can delete venues')),
  ('086', 'rule "Admins can insert venues" on venues', EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'venues' AND policyname = 'Admins can insert venues')),
  ('086', 'rule "Admins can update venues" on venues', EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'venues' AND policyname = 'Admins can update venues')),
  ('086', 'rule "Users can view venues in their organization" on venues', EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'venues' AND policyname = 'Users can view venues in their organization')),
  ('089', 'rule "Admins can view gig reports" on gig_reports', EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'gig_reports' AND policyname = 'Admins can view gig reports')),
  ('091', 'rule "Admins can insert impersonation logs" on impersonation_log', EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'impersonation_log' AND policyname = 'Admins can insert impersonation logs')),
  ('092', 'function log_staffing_event', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' AND p.proname = 'log_staffing_event')),
  ('092', 'rule "Admins can view staffing events" on staffing_events', EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'staffing_events' AND policyname = 'Admins can view staffing events')),
  ('094', 'function claim_chair', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' AND p.proname = 'claim_chair')),
  ('094', 'function create_offer', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' AND p.proname = 'create_offer')),
  ('096', 'function cascade_refusal', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' AND p.proname = 'cascade_refusal')),
  ('096', 'function guard_substitution_request_chair', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' AND p.proname = 'guard_substitution_request_chair')),
  ('096', 'function mark_cascade_exhausted', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' AND p.proname = 'mark_cascade_exhausted')),
  ('096', 'function set_allow_worker_drop_default', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' AND p.proname = 'set_allow_worker_drop_default')),
  ('096', 'trigger trg_guard_substitution_request_chair on substitution_requests', EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'trg_guard_substitution_request_chair' AND tgrelid = to_regclass('public.substitution_requests'))),
  ('096', 'trigger trg_set_allow_worker_drop_default on organizations', EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'trg_set_allow_worker_drop_default' AND tgrelid = to_regclass('public.organizations')))
)
SELECT
  'migration ' || migration AS check_name,
  CASE WHEN bool_and(present) THEN 'PASS'
       ELSE 'MISSING: ' || string_agg(item, '; ') FILTER (WHERE NOT present) END AS result
FROM expected
GROUP BY migration
UNION ALL
SELECT
  '081 protection is the safe kind (not security definer)',
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
                     WHERE s.nspname = 'public' AND p.proname = 'protect_privileged_org_columns')
      THEN 'MISSING'
    WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
                 WHERE s.nspname = 'public' AND p.proname = 'protect_privileged_org_columns' AND p.prosecdef)
      THEN 'UNSAFE: security definer, tell Claude'
    ELSE 'PASS' END
ORDER BY 1;
