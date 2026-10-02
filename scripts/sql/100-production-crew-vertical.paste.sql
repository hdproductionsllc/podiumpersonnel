-- ============================================================================
-- PODIUM — THE PRODUCTION CREW VERTICAL (migration 100, 2026-10-02)
--
-- HOW TO RUN — BEFORE the Release 2 step 4 code is deployed
--   1. Supabase Dashboard -> SQL Editor -> New query
--   2. Paste this ENTIRE file -> Run
--   3. Read the "RESULTS" table printed at the very bottom. Every row should
--      say PASS (rows marked INFO are just counts for you to read). If one
--      says FAIL, paste the whole output back to Claude.
--
-- Needs migrations 096 (already live) and 098 (Release 2 step 2, pasted
-- first). Safe to run more than once: the second run changes nothing. It runs
-- inside one transaction, so if any statement errors NOTHING is applied —
-- paste the error back to Claude. It deletes nothing and changes no existing
-- row.
--
-- WHAT IT DOES, in plain English
--   * Allows a new kind of organization, "Production Company" (an AV, lighting
--     or staging shop that books freelance crew per show). Your six companies
--     stay exactly what they are.
--   * A new production company starts with two switches on: chairs that work
--     only some calls ("8 stagehands for the load-in"), and "I can't make it"
--     for its crew. Auto-offer stays off, as it is for everyone.
--   * Only Podium can change which kind of organization a company is (like
--     billing). Today an admin could change it from a browser; nothing in the
--     app ever does.
--
--   For every existing organization nothing anyone sees, receives or is paid
--   changes.
--
-- Body below is supabase/migrations/100_production_crew_vertical.sql, copied
-- verbatim, followed by the migrations-log entry.
-- ============================================================================

BEGIN;

-- 100: the production_crew vertical (the "Overhire" template)
--
-- WHY (the plan, Release 2 B2.8; target architecture 5, section 8 row 20)
--   A live-event production company books freelance crew per show: an A1 for
--   every call, eight stagehands for the load-in. It runs on the same engine as
--   every other organization, under its own words (Show, Call, Role, Tech) and
--   its own brand. This is the database half: the new vertical is allowed, and
--   a new crew organization starts with the two switches a crew needs.
--   (Renumbered from the overhire-demo-skin branch's 084, a number master has
--   since used.)
--
-- WHAT CHANGES
--   1. organizations_vertical_check allows 'production_crew' (the seven
--      existing values unchanged).
--   2. A new production_crew organization starts with
--      call_scoped_requirements ON (chairs that work only some calls, and
--      "Add crew" requirements, 098/099). Trigger
--      trg_set_call_scoped_requirements_default, BEFORE INSERT, only for
--      vertical = 'production_crew'. The column's default stays false, so every
--      other organization, existing and new, is untouched. No existing row is
--      updated: until this runs no organization can be production_crew.
--      Podium can still switch it off for a crew organization afterwards
--      (service role; the column is frozen to everyone else by 098).
--   3. allow_worker_drop: already ON for a new production_crew organization.
--      096's trigger gives it to every vertical outside music_contractor and
--      orchestra_band; nothing here changes it, the RESULTS check proves it.
--      auto_cascade stays OFF for everyone (096's default), crew included.
--   4. organizations.vertical joins the columns only Podium can change
--      (protect_privileged_org_columns, 081 + 098). An organization's vertical
--      decides its words, its brand ("via Overhire" in its emails) and its
--      default switches; nothing in the app changes it after sign-up (the
--      create_organization_with_owner RPC sets it at insert, which the trigger
--      does not look at). Today an admin could change it from a browser.
--
-- SAFE AGAINST TODAY'S CODE
--   Additive. Every existing organization keeps its vertical and every
--   switch; the new trigger only acts on a production_crew insert, which
--   today's code cannot make (its onboarding picker does not list the vertical
--   until the code that reads this ships). Paste this BEFORE that code (house
--   rule): the picker lists "Production Company" as soon as the code is live,
--   and choosing it fails at the CHECK until this has run.
--
-- Needs 065 (vertical), 081 (protect_privileged_org_columns), 096
-- (allow_worker_drop and its trigger) and 098 (call_scoped_requirements).
-- Idempotent and safe to re-run.

-- ---------------------------------------------------------------------------
-- 0. Refuse to run without what it builds on.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'call_scoped_requirements'
  ) THEN
    RAISE EXCEPTION 'Migration 100 stopped, nothing was changed: organizations.call_scoped_requirements (migration 098) is missing.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'allow_worker_drop'
  ) OR to_regprocedure('public.set_allow_worker_drop_default()') IS NULL THEN
    RAISE EXCEPTION 'Migration 100 stopped, nothing was changed: allow_worker_drop and its default (migration 096) are missing.';
  END IF;
  IF to_regprocedure('public.protect_privileged_org_columns()') IS NULL THEN
    RAISE EXCEPTION 'Migration 100 stopped, nothing was changed: protect_privileged_org_columns (migration 081) is missing.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Allow the vertical
-- ---------------------------------------------------------------------------
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_vertical_check;
ALTER TABLE organizations ADD CONSTRAINT organizations_vertical_check
  CHECK (vertical IN (
    'music_contractor',
    'orchestra_band',
    'choir',
    'theatre',
    'dance',
    'church_worship',
    'event_agency',
    'production_crew'
  ));

-- ---------------------------------------------------------------------------
-- 2. A new crew organization starts with call-scoped requirements on
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_call_scoped_requirements_default()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.vertical = 'production_crew' THEN
    NEW.call_scoped_requirements := true;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION set_call_scoped_requirements_default() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_set_call_scoped_requirements_default ON organizations;
CREATE TRIGGER trg_set_call_scoped_requirements_default
  BEFORE INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_call_scoped_requirements_default();

COMMENT ON COLUMN organizations.call_scoped_requirements IS
  'When true, a chair can be limited to some of its gig''s services (project_positions.scope_mode, position_services) and requirements can be added. Off by default; on for a new production_crew organization (trigger, migration 100); set by Podium only.';

-- ---------------------------------------------------------------------------
-- 3. Only Podium changes an organization's vertical
-- ---------------------------------------------------------------------------
-- 098's function, unchanged apart from the one added line (SECURITY INVOKER is
-- required: see 081).
CREATE OR REPLACE FUNCTION protect_privileged_org_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  changed TEXT[] := '{}';
BEGIN
  -- The service role (billing webhook, provisioning, migrations) is exactly who
  -- SHOULD be setting these. Everything else — anon, authenticated — is not.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.is_comped              IS DISTINCT FROM OLD.is_comped              THEN changed := array_append(changed, 'is_comped'); END IF;
  IF NEW.plan_tier              IS DISTINCT FROM OLD.plan_tier              THEN changed := array_append(changed, 'plan_tier'); END IF;
  IF NEW.subscription_status    IS DISTINCT FROM OLD.subscription_status    THEN changed := array_append(changed, 'subscription_status'); END IF;
  IF NEW.trial_ends_at          IS DISTINCT FROM OLD.trial_ends_at          THEN changed := array_append(changed, 'trial_ends_at'); END IF;
  IF NEW.stripe_customer_id     IS DISTINCT FROM OLD.stripe_customer_id     THEN changed := array_append(changed, 'stripe_customer_id'); END IF;
  IF NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id THEN changed := array_append(changed, 'stripe_subscription_id'); END IF;
  IF NEW.library_org_id         IS DISTINCT FROM OLD.library_org_id         THEN changed := array_append(changed, 'library_org_id'); END IF;
  IF NEW.intake_enabled         IS DISTINCT FROM OLD.intake_enabled         THEN changed := array_append(changed, 'intake_enabled'); END IF;
  IF NEW.call_scoped_requirements IS DISTINCT FROM OLD.call_scoped_requirements THEN changed := array_append(changed, 'call_scoped_requirements'); END IF;
  IF NEW.vertical               IS DISTINCT FROM OLD.vertical               THEN changed := array_append(changed, 'vertical'); END IF;

  IF array_length(changed, 1) > 0 THEN
    RAISE EXCEPTION
      'These fields are managed by Podium and cannot be changed directly: %',
      array_to_string(changed, ', ')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

-- verify:
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'organizations_vertical_check';  -- lists production_crew
-- SELECT vertical, call_scoped_requirements, allow_worker_drop, auto_cascade, count(*) FROM organizations GROUP BY 1, 2, 3, 4;
--   every existing row exactly as before 100 (music_contractor: false / false / false)

-- ---------------------------------------------------------------------------
-- Record that 100 is applied (docs/database-tests.md, "Recording an
-- application"), in the same transaction so it is only recorded if it ran.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('100', '100_production_crew_vertical')
ON CONFLICT (version) DO NOTHING;

COMMIT;


-- ============================================================================
-- RESULTS — read this table. Every row should say PASS (INFO rows are counts).
-- ============================================================================

SELECT
  'organizations can be a production company' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organizations_vertical_check' AND conrelid = 'public.organizations'::regclass
      AND pg_get_constraintdef(oid) LIKE '%production_crew%'
      AND pg_get_constraintdef(oid) LIKE '%music_contractor%'
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END AS result
UNION ALL
SELECT
  'every organization still has a kind the app knows',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM organizations WHERE vertical NOT IN (
      'music_contractor', 'orchestra_band', 'choir', 'theatre', 'dance',
      'church_worship', 'event_agency', 'production_crew')
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'a new production company starts with "only some calls" on',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_set_call_scoped_requirements_default'
      AND tgrelid = 'public.organizations'::regclass AND NOT tgisinternal
  ) AND position('production_crew' IN pg_get_functiondef('public.set_call_scoped_requirements_default()'::regprocedure)) > 0
    THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  '"only some calls" is still off by default for everyone else',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations'
      AND column_name = 'call_scoped_requirements' AND is_nullable = 'NO' AND column_default = 'false'
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  '"only some calls" is off for every organization that is not a production company',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM organizations WHERE call_scoped_requirements AND vertical <> 'production_crew'
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'a new production company gets "I can''t make it" on (096''s rule)',
  CASE WHEN position('''music_contractor'', ''orchestra_band''' IN pg_get_functiondef('public.set_allow_worker_drop_default()'::regprocedure)) > 0
    THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'auto-offer is off for every organization',
  CASE WHEN NOT EXISTS (SELECT 1 FROM organizations WHERE auto_cascade)
    THEN 'PASS' ELSE 'FAIL - an organization has it on, tell Claude' END
UNION ALL
SELECT
  'only Podium can change an organization''s kind',
  CASE WHEN position('NEW.vertical' IN pg_get_functiondef('public.protect_privileged_org_columns()'::regprocedure)) > 0
        AND position('call_scoped_requirements' IN pg_get_functiondef('public.protect_privileged_org_columns()'::regprocedure)) > 0
    THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'browsers cannot call the new database step',
  CASE WHEN NOT has_function_privilege('authenticated', 'public.set_call_scoped_requirements_default()', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.set_call_scoped_requirements_default()', 'EXECUTE')
    THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'migration 100 is recorded as applied',
  CASE WHEN EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '100')
    THEN 'PASS' ELSE 'FAIL - tell Claude' END

-- For information only.
UNION ALL
SELECT
  'INFO: organizations by kind',
  'INFO - ' || (SELECT string_agg(vertical || ': ' || n, ', ' ORDER BY vertical)
                  FROM (SELECT vertical, count(*) AS n FROM organizations GROUP BY vertical) v)
UNION ALL
SELECT
  'INFO: production companies (expect 0 until one signs up)',
  'INFO - ' || (SELECT count(*) FROM organizations WHERE vertical = 'production_crew')::text;
