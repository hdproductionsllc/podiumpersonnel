-- ============================================================================
-- PODIUM — PROTECT PRIVILEGED ORG COLUMNS (2026-08-06)
--
-- HOW TO RUN
--   1. Back up first, from your terminal:   node scripts/backup-database.js
--   2. Supabase Dashboard -> SQL Editor -> New query
--   3. Paste this ENTIRE file -> Run
--   4. Read the "RESULTS" table at the bottom. Every row should say OK.
--
-- Safe to run more than once. Running it twice changes nothing the second time.
--
-- WHAT IT DOES
--   Freezes eight columns on the organizations table so that only Podium's own
--   backend can change them. Today an org admin can change them on their own
--   organization, straight from the browser, because the app talks to the
--   database directly and the existing permission rule works row-by-row — it
--   cannot say "you may edit this row but not THAT column."
--
--   The two that matter:
--     - is_comped / plan_tier / subscription_status  -> an admin could grant
--       themselves permanent free top-tier access.
--     - library_org_id                                -> an admin could point
--       their org at ANOTHER org's sheet-music library and browse, preview,
--       download and write into it.
--
-- WHY THIS MATTERS MORE THAN IT SOUNDS
--   The plan limits installed on 2026-08-06 (scripts/plan-limits-2026-08-06.sql)
--   read exactly these columns to decide an org's tier. Until this script runs,
--   those limits can be switched off by the very people they apply to. The caps
--   are only as trustworthy as the columns they read.
--
-- WHAT DOES NOT CHANGE
--   Nothing your team does day to day touches these columns — they are not
--   editable anywhere in the app's own screens. Billing writes them via Stripe's
--   webhook, and library sharing is set up by script; both use the backend role,
--   which this deliberately still allows. Your existing setup is unaffected:
--   Subito Strings, Meridian and Lonestar keep reading Project String Quartet's
--   library, and every org stays comped.
--
-- This is migration 081, which merged in PR #8 on 2026-08-03 but was never run
-- against production. The file is
-- supabase/migrations/081_protect_privileged_org_columns.sql and the code below
-- is that migration verbatim, plus the reporting.
-- ============================================================================


-- SECURITY INVOKER (the default) is REQUIRED here, not an oversight. Under
-- SECURITY DEFINER, current_user is rewritten to the function's OWNER, so the
-- role check below would read 'postgres' for every caller and wave everything
-- through — which is exactly what the first version of this migration did, and
-- it silently passed until the attack was re-run against a real database. The
-- function touches no tables, so it needs no elevated rights.
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

  IF array_length(changed, 1) > 0 THEN
    RAISE EXCEPTION
      'These fields are managed by Podium and cannot be changed directly: %',
      array_to_string(changed, ', ')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_privileged_org_columns ON organizations;
CREATE TRIGGER trg_protect_privileged_org_columns
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION protect_privileged_org_columns();

COMMENT ON FUNCTION protect_privileged_org_columns() IS
  'Freezes billing and library-pointer columns on organizations against every role '
  'except the service role. The admin UPDATE policy is row-level and cannot express '
  'a column restriction, so this trigger carries it.';


-- ============================================================================
-- RESULTS — read this table. Every row should say OK.
-- ============================================================================
SELECT * FROM (

  SELECT 1 AS sort, 'The guard is installed' AS item,
         CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                            WHERE tgname = 'trg_protect_privileged_org_columns')
              THEN 'OK' ELSE 'FAILED' END AS status,
         CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                            WHERE tgname = 'trg_protect_privileged_org_columns')
              THEN 'Billing and library columns are now frozen to the backend only.'
              ELSE 'The trigger was not created. Send this to Claude.' END AS detail

  UNION ALL
  -- The bug that shipped the first time: under SECURITY DEFINER this function
  -- waves everyone through. Assert the mode explicitly rather than trusting it.
  SELECT 2, 'The guard actually checks the caller',
         CASE WHEN (SELECT NOT prosecdef FROM pg_proc
                     WHERE proname = 'protect_privileged_org_columns')
              THEN 'OK' ELSE 'FAILED' END,
         CASE WHEN (SELECT NOT prosecdef FROM pg_proc
                     WHERE proname = 'protect_privileged_org_columns')
              THEN 'Correct mode — it sees who is really calling.'
              ELSE 'Wrong mode: it would wave every caller through. Tell Claude.' END

  UNION ALL
  -- Audit, not enforcement: rows here are orgs reading someone else's library.
  -- Expect exactly 3 — Lonestar, Meridian and Subito Strings reading Project
  -- String Quartet. Anything else appearing means it was changed by someone.
  SELECT 3, 'Nobody redirected their library',
         CASE WHEN (SELECT count(*) FROM organizations o
                     WHERE o.library_org_id IS DISTINCT FROM o.id
                       AND o.library_org_id IS NOT NULL) = 3
              THEN 'OK' ELSE 'CHECK THIS' END,
         (SELECT count(*) FROM organizations o
           WHERE o.library_org_id IS DISTINCT FROM o.id
             AND o.library_org_id IS NOT NULL)::TEXT ||
         ' org(s) read another org''s library. Expected 3 (Lonestar, Meridian, Subito Strings).'

  UNION ALL
  -- Every org is comped by design (founding orgs, Pro forever). Flag growth.
  SELECT 4, 'Nobody comped themselves',
         CASE WHEN (SELECT count(*) FROM organizations WHERE is_comped) = 6
              THEN 'OK' ELSE 'CHECK THIS' END,
         (SELECT count(*) FROM organizations WHERE is_comped)::TEXT ||
         ' org(s) are comped. Expected 6 — all of yours, comped on purpose.'

  UNION ALL
  SELECT 5, 'Nobody started a subscription',
         CASE WHEN (SELECT count(*) FROM organizations
                     WHERE subscription_status IS NOT NULL) = 0
              THEN 'OK' ELSE 'CHECK THIS' END,
         (SELECT count(*) FROM organizations WHERE subscription_status IS NOT NULL)::TEXT ||
         ' org(s) have a billing status. Expected 0 while billing is off.'

) r ORDER BY sort;


-- ============================================================================
-- IF A ROW SAYS "CHECK THIS"
--
-- Rows 3-5 are an audit of what is already in the table, not a test of the
-- guard. The guard stops FUTURE writes; it cannot undo a past one. As of
-- 2026-08-06 all three were clean, so a surprise here means something changed
-- after that date. These show the detail:
--
--   SELECT o.name AS reader, l.name AS reads_library_of
--   FROM organizations o JOIN organizations l ON l.id = o.library_org_id
--   WHERE o.library_org_id IS DISTINCT FROM o.id;
--
--   SELECT name, is_comped, plan_tier, subscription_status
--   FROM organizations WHERE is_comped OR subscription_status IS NOT NULL;
-- ============================================================================
