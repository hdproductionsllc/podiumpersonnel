-- ============================================================================
-- PODIUM — PLAN LIMITS + SECURITY CHECK (2026-08-06)
--
-- HOW TO RUN
--   1. Back up first, from your terminal:   node scripts/backup-database.js
--   2. Supabase Dashboard -> SQL Editor -> New query
--   3. Paste this ENTIRE file -> Run
--   4. Read the "RESULTS" table printed at the very bottom. It tells you in
--      plain English whether each part worked. Send that table to Claude.
--
-- Safe to run more than once. Running it twice changes nothing the second time.
--
-- WHAT IT DOES
--   PART 1 (the fix)   - Installs the plan limits in the database itself.
--                        Right now the caps on performers and active projects
--                        only grey out a button; the database still accepts the
--                        write. This makes the database say no.
--
--   PART 2 (the check) - Reports whether migration 081 is installed. This one
--                        is READ-ONLY: it changes nothing, it only looks.
--
-- NOTHING CHANGES FOR ANYONE TODAY. The limits install switched OFF, because
-- billing is off. Every org keeps unlimited everything until you deliberately
-- flip the switch (see "WHEN YOU START CHARGING" at the bottom of this file).
-- This is why it is safe to run during business hours.
--
-- This is migration 080, which merged in PR #7 on 2026-08-02 but was never run
-- against production. The file is supabase/migrations/080_enforce_plan_limits.sql
-- and this script is that migration verbatim, plus the reporting.
-- ============================================================================


-- ============================================================================
-- PART 1 — Enforce plan limits in the database
--
-- Performers, projects and services are written CLIENT-SIDE, straight to
-- PostgREST under RLS — there is no API route in between. So the plan caps in
-- src/lib/plan.ts (canAddMusician / canCreateProject) only ever disabled a
-- button: anyone with a session and devtools could insert past them.
--
-- NOT a security boundary — tenant isolation is RLS's job and is unchanged.
-- This is a commercial cap.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The master switch, DB-side
-- ---------------------------------------------------------------------------
-- resolveOrgPlan() short-circuits to Symphony while NEXT_PUBLIC_BILLING_ENABLED
-- is off, and Postgres cannot read that env var. So the switch is mirrored
-- here, defaulting to FALSE — today's behaviour exactly, no enforcement at all
-- until you deliberately turn it on.

CREATE TABLE IF NOT EXISTS app_settings (
  -- Single-row table: the CHECK pins the PK to one value, so a second row is
  -- rejected rather than silently shadowing the first.
  id               BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  billing_enforced BOOLEAN NOT NULL DEFAULT false,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- No policies: the functions below read it as SECURITY DEFINER, and nothing
-- should reach this table through PostgREST.
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE app_settings IS
  'Single-row instance config. billing_enforced mirrors NEXT_PUBLIC_BILLING_ENABLED '
  'for the plan-limit triggers; flip both together at launch.';

-- ---------------------------------------------------------------------------
-- 2. Effective tier for an org — mirrors resolveOrgPlan() in src/lib/plan.ts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION org_plan_tier(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  o        RECORD;
  enforced BOOLEAN;
BEGIN
  SELECT is_comped, subscription_status, plan_tier, trial_ends_at
    INTO o
    FROM organizations
   WHERE id = p_org_id;

  -- Unknown org: not this trigger's business to block. The FK will.
  IF NOT FOUND THEN
    RETURN 'symphony';
  END IF;

  -- Founding orgs keep top-tier access forever, including after enforcement is
  -- switched on. Checked FIRST, exactly as resolveOrgPlan does.
  IF coalesce(o.is_comped, false) THEN
    RETURN 'symphony';
  END IF;

  SELECT billing_enforced INTO enforced FROM app_settings WHERE id;
  IF NOT coalesce(enforced, false) THEN
    RETURN 'symphony';
  END IF;

  -- past_due keeps access on purpose (grace period), same as the app.
  IF o.subscription_status IN ('active', 'trialing', 'past_due') THEN
    RETURN CASE
             WHEN o.plan_tier IN ('ensemble', 'orchestra', 'symphony') THEN o.plan_tier
             ELSE 'ensemble'
           END;
  END IF;

  IF o.trial_ends_at IS NOT NULL AND o.trial_ends_at > now() THEN
    RETURN 'symphony';
  END IF;

  RETURN 'free';
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. The limits — mirrors PLAN_LIMITS. NULL means unlimited (JS Infinity).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION org_plan_limit(p_org_id UUID, p_limit TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  t TEXT := org_plan_tier(p_org_id);
BEGIN
  RETURN CASE p_limit
    WHEN 'musicians' THEN
      CASE t WHEN 'free' THEN 25 WHEN 'ensemble' THEN 60 WHEN 'orchestra' THEN 250 ELSE NULL END
    WHEN 'active_projects' THEN
      CASE t WHEN 'free' THEN 3 ELSE NULL END
    ELSE NULL
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Performers
-- ---------------------------------------------------------------------------
-- Counts every row for the org, matching the dashboard's own count (the
-- musicians page does not filter on is_active, so neither does this).
CREATE OR REPLACE FUNCTION enforce_musician_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  lim INTEGER := org_plan_limit(NEW.organization_id, 'musicians');
  cnt INTEGER;
BEGIN
  IF lim IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO cnt FROM musicians WHERE organization_id = NEW.organization_id;

  IF cnt >= lim THEN
    RAISE EXCEPTION
      'Plan limit reached: your plan includes % performers. Upgrade to add more.', lim
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_musician_limit ON musicians;
CREATE TRIGGER trg_enforce_musician_limit
  BEFORE INSERT ON musicians
  FOR EACH ROW EXECUTE FUNCTION enforce_musician_limit();

-- ---------------------------------------------------------------------------
-- 5. Active projects
-- ---------------------------------------------------------------------------
-- "Active" is status in ('active','draft'), matching projects-client.tsx.
-- The UPDATE case matters as much as INSERT: without it, an org at its cap
-- could complete a project and reopen an old one indefinitely, or simply
-- create everything as 'completed' and flip it afterwards.
CREATE OR REPLACE FUNCTION enforce_project_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  lim INTEGER := org_plan_limit(NEW.organization_id, 'active_projects');
  cnt INTEGER;
BEGIN
  IF lim IS NULL OR NEW.status NOT IN ('active', 'draft') THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, only charge for a project that is entering the counted set.
  -- Editing a project that was already active must not be blocked by the cap
  -- it is itself part of.
  IF TG_OP = 'UPDATE' AND OLD.status IN ('active', 'draft') THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO cnt
    FROM projects
   WHERE organization_id = NEW.organization_id
     AND status IN ('active', 'draft');

  IF cnt >= lim THEN
    RAISE EXCEPTION
      'Plan limit reached: your plan includes % active projects. Complete one or upgrade.', lim
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_project_limit ON projects;
CREATE TRIGGER trg_enforce_project_limit
  BEFORE INSERT OR UPDATE OF status ON projects
  FOR EACH ROW EXECUTE FUNCTION enforce_project_limit();


-- ============================================================================
-- RESULTS — read this table. Every row should say OK.
-- The only row that may say ACTION NEEDED is the migration 081 check.
-- ============================================================================
SELECT * FROM (

  -- ---- PART 1: did the plan limits install? -------------------------------
  SELECT 1 AS sort, 'Plan limits: master switch' AS item,
         CASE WHEN EXISTS (SELECT 1 FROM app_settings)
              THEN 'OK' ELSE 'FAILED' END AS status,
         CASE WHEN EXISTS (SELECT 1 FROM app_settings)
              THEN 'Installed and switched OFF — nothing changes for anyone today.'
              ELSE 'The settings table was not created. Send this to Claude.' END AS detail

  UNION ALL
  SELECT 2, 'Plan limits: the two guards',
         CASE WHEN (SELECT count(*) FROM pg_trigger
                     WHERE tgname IN ('trg_enforce_musician_limit',
                                      'trg_enforce_project_limit')) = 2
              THEN 'OK' ELSE 'FAILED' END,
         'Expected 2 guards (performers, active projects). Found ' ||
         (SELECT count(*) FROM pg_trigger
           WHERE tgname IN ('trg_enforce_musician_limit',
                            'trg_enforce_project_limit'))::TEXT || '.'

  UNION ALL
  SELECT 3, 'Plan limits: enforcement is off',
         CASE WHEN (SELECT billing_enforced FROM app_settings WHERE id) IS FALSE
              THEN 'OK' ELSE 'CHECK THIS' END,
         CASE WHEN (SELECT billing_enforced FROM app_settings WHERE id) IS FALSE
              THEN 'Correct — limits are installed but dormant until you charge.'
              ELSE 'Enforcement is ON. If you did not intend that, tell Claude.' END

  UNION ALL
  SELECT 4, 'Plan limits: nobody is capped today',
         CASE WHEN (SELECT count(*) FROM organizations
                     WHERE org_plan_tier(id) <> 'symphony') = 0
              THEN 'OK' ELSE 'CHECK THIS' END,
         (SELECT count(*) FROM organizations
           WHERE org_plan_tier(id) <> 'symphony')::TEXT ||
         ' org(s) resolve to a limited tier. Expected 0 while billing is off.'

  -- ---- PART 2: the read-only check on migration 081 -----------------------
  UNION ALL
  SELECT 5, 'Migration 081 (security)',
         CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                            WHERE tgname = 'trg_protect_privileged_org_columns')
              THEN 'OK' ELSE 'ACTION NEEDED' END,
         CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                            WHERE tgname = 'trg_protect_privileged_org_columns')
              THEN 'Installed. Orgs cannot edit their own privileged columns.'
              ELSE 'NOT installed — migration 081 never ran. Send this to Claude.' END

) r ORDER BY sort;


-- ============================================================================
-- WHEN YOU START CHARGING — do not do this today
--
-- These two must be flipped TOGETHER, or the app and the database disagree:
--   1. Vercel:   NEXT_PUBLIC_BILLING_ENABLED=true
--   2. Postgres: UPDATE app_settings SET billing_enforced = true;
--
-- Only the app flag  -> the UI gates but the database still lets writes through.
-- Only the DB flag   -> inserts fail with no upgrade prompt explaining why.
--
-- BEFORE flipping, run this to see who would be over their cap on day one, so
-- nobody is silently broken by the change:
--
--   SELECT o.name,
--          o.is_comped,
--          (SELECT count(*) FROM musicians m WHERE m.organization_id = o.id) AS performers,
--          (SELECT count(*) FROM projects p WHERE p.organization_id = o.id
--             AND p.status IN ('active','draft')) AS active_projects
--   FROM organizations o ORDER BY performers DESC;
-- ============================================================================
