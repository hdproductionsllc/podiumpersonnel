-- ============================================================================
-- PODIUM — AUTO-OFFER AND "I CAN'T MAKE IT" SWITCHES (migration 096, 2026-10-02)
--
-- HOW TO RUN — BEFORE the code that uses it is deployed
--   1. Supabase Dashboard -> SQL Editor -> New query
--   2. Paste this ENTIRE file -> Run
--   3. Read the "RESULTS" table printed at the very bottom. Every row should
--      say PASS (rows marked INFO are just counts for you to read). If one
--      says FAIL, paste the whole output back to Claude.
--
-- Safe to run more than once: the second run changes nothing, and it never
-- undoes a switch you have flipped since. It runs inside one transaction, so
-- if any statement errors NOTHING is applied — paste the error back to Claude.
--
-- WHAT IT DOES, in plain English
--   Adds four switches. None of them changes anything today:
--
--   * "Auto-offer to the next person" for each organization. OFF for every
--     organization. While it is off, Podium behaves exactly as it does now.
--   * "Let people drop out themselves" for each organization. OFF for your
--     music organizations (musicians keep asking for a substitute, as now),
--     ON for the other kinds of organization. Nothing uses it until the
--     "I can't make it" button ships.
--   * "Don't auto-offer this chair", one per chair. Off everywhere.
--   * A note on each offer of which earlier offer caused it, with a database
--     rule that one declined or expired offer can cause at most one automatic
--     offer, however many times the system tries.
--
--   Nothing here changes pay, who is emailed, or what emails say.
--
-- Body below is supabase/migrations/096_auto_cascade_settings.sql, copied
-- verbatim, followed by the migrations-log entry.
-- ============================================================================

BEGIN;

-- 096: the switches for auto-cascade and worker drop, and the cascade's idempotency key
--
-- WHY (the plan, Release 1 B1.1 / B1.3; target architecture 4 and 9)
--   Auto-cascade ("when someone says no, offer the chair to the next person")
--   and worker drop ("I can't make it" on the gig page) are new behaviour. Both
--   are off unless an organization chooses them, and auto-cascade can be
--   switched off for a single chair. The cascade itself is later code; this
--   step only adds the switches it will read, and the one database rule that
--   makes it safe to run from two places at once.
--
-- WHAT CHANGES
--   1. organizations.auto_cascade boolean NOT NULL DEFAULT false.
--      OFF for every organization, existing and new.
--   2. organizations.allow_worker_drop boolean NOT NULL.
--      Existing organizations: false for the music verticals
--      (music_contractor, orchestra_band), where the substitute-request flow
--      stays the way out; true for every other vertical. New organizations get
--      the same default from their vertical (trigger set_allow_worker_drop_default,
--      BEFORE INSERT, only when the insert leaves the column out). The music
--      verticals are the ones create_organization_with_owner (067) seeds with
--      the instrument library, and the ones whose template says skillSeeds 'sql'.
--   3. project_positions.auto_cascade_disabled boolean NOT NULL DEFAULT false.
--      The per-chair "don't auto-offer this chair" switch.
--   4. contract_offers.cascaded_from_offer_id uuid NULL, references
--      contract_offers(id) ON DELETE SET NULL. Set only on an offer the cascade
--      made: the offer whose decline, expiry or drop caused it.
--   5. contract_offers_one_cascade_per_trigger: a UNIQUE index on
--      cascaded_from_offer_id. One triggering offer can cause at most one
--      cascaded offer, ever, whoever tries (two cron runs, a decline racing the
--      cron). A triggering offer belongs to exactly one chair, so this is the
--      (chair, triggering offer) key.
--
-- Nothing reads these yet in today's code, and every default reproduces
-- today's behaviour, so this is safe to paste BEFORE the code that uses it
-- (house rule: migration first).
--
-- Idempotent and safe to re-run.

-- ---------------------------------------------------------------------------
-- 0. Refuse to run without the vertical column (065).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'vertical'
  ) THEN
    RAISE EXCEPTION 'Migration 096 stopped, nothing was changed: organizations.vertical (migration 065) is missing.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. auto_cascade: off for everyone
-- ---------------------------------------------------------------------------
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS auto_cascade boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN organizations.auto_cascade IS
  'When true, a declined, expired or dropped offer is automatically offered to the next unconflicted candidate on the same terms. Off by default.';

-- ---------------------------------------------------------------------------
-- 2. allow_worker_drop: by vertical
-- ---------------------------------------------------------------------------
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS allow_worker_drop boolean;

-- Existing rows. Only rows still NULL, so a re-run never overwrites a choice
-- an admin has made since.
UPDATE organizations
   SET allow_worker_drop = (vertical NOT IN ('music_contractor', 'orchestra_band'))
 WHERE allow_worker_drop IS NULL;

-- New rows: a column default cannot read another column, so a BEFORE INSERT
-- trigger fills it from the vertical when the insert leaves it out. NOT NULL
-- is checked after BEFORE triggers run.
CREATE OR REPLACE FUNCTION set_allow_worker_drop_default()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.allow_worker_drop IS NULL THEN
    NEW.allow_worker_drop := COALESCE(NEW.vertical, 'music_contractor') NOT IN ('music_contractor', 'orchestra_band');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_allow_worker_drop_default ON organizations;
CREATE TRIGGER trg_set_allow_worker_drop_default
  BEFORE INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_allow_worker_drop_default();

ALTER TABLE organizations
  ALTER COLUMN allow_worker_drop SET NOT NULL;

COMMENT ON COLUMN organizations.allow_worker_drop IS
  'When true, a worker who accepted can release themselves from the gig page. Defaults to false for music verticals (they request a substitute instead) and true for the others.';

-- ---------------------------------------------------------------------------
-- 3. The per-chair switch
-- ---------------------------------------------------------------------------
ALTER TABLE project_positions
  ADD COLUMN IF NOT EXISTS auto_cascade_disabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN project_positions.auto_cascade_disabled IS
  'True: never auto-offer this chair, even when the organization has auto_cascade on.';

-- ---------------------------------------------------------------------------
-- 4-5. Which offer caused a cascaded offer, at most one per cause
-- ---------------------------------------------------------------------------
ALTER TABLE contract_offers
  ADD COLUMN IF NOT EXISTS cascaded_from_offer_id uuid
    REFERENCES contract_offers(id) ON DELETE SET NULL;

COMMENT ON COLUMN contract_offers.cascaded_from_offer_id IS
  'Set only on an offer the auto-cascade made: the declined, expired or dropped offer that caused it. Unique, so one cause makes at most one cascaded offer.';

CREATE UNIQUE INDEX IF NOT EXISTS contract_offers_one_cascade_per_trigger
  ON contract_offers (cascaded_from_offer_id)
  WHERE cascaded_from_offer_id IS NOT NULL;

-- ===========================================================================
-- verify:
-- SELECT vertical, allow_worker_drop, auto_cascade, count(*) FROM organizations GROUP BY 1, 2, 3;
--   music_contractor / orchestra_band rows: allow_worker_drop false; others true; auto_cascade all false
-- SELECT indexname FROM pg_indexes WHERE indexname = 'contract_offers_one_cascade_per_trigger';   -- 1 row

-- ---------------------------------------------------------------------------
-- Record that 096 is applied (docs/database-tests.md, "Recording an
-- application"), in the same transaction so it is only recorded if it ran.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('096', '096_auto_cascade_settings')
ON CONFLICT (version) DO NOTHING;

COMMIT;


-- ============================================================================
-- RESULTS — read this table. Every row should say PASS (INFO rows are counts).
-- ============================================================================

SELECT
  'organizations have the auto-offer switch, off unless set' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'auto_cascade'
      AND data_type = 'boolean' AND is_nullable = 'NO' AND column_default = 'false'
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END AS result
UNION ALL
SELECT
  'organizations have the drop-out switch, never empty',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'allow_worker_drop'
      AND data_type = 'boolean' AND is_nullable = 'NO'
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'new organizations get the drop-out switch from their type',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_set_allow_worker_drop_default' AND tgrelid = 'public.organizations'::regclass
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'chairs have the "don''t auto-offer this chair" switch, off unless set',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_positions' AND column_name = 'auto_cascade_disabled'
      AND data_type = 'boolean' AND is_nullable = 'NO' AND column_default = 'false'
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'offers can record which offer caused them',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contract_offers' AND column_name = 'cascaded_from_offer_id'
      AND data_type = 'uuid' AND is_nullable = 'YES'
  ) AND EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.contract_offers'::regclass AND contype = 'f'
      AND confrelid = 'public.contract_offers'::regclass AND confdeltype = 'n'
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.contract_offers'::regclass AND attname = 'cascaded_from_offer_id')]
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'one declined/expired offer can cause at most one automatic offer',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'contract_offers_one_cascade_per_trigger'
      AND indexdef LIKE 'CREATE UNIQUE INDEX%'
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'music organizations keep the substitute flow (drop-out off)',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM organizations
    WHERE vertical IN ('music_contractor', 'orchestra_band') AND allow_worker_drop
  ) THEN 'PASS' ELSE 'INFO - ' || (
    SELECT count(*) FROM organizations
    WHERE vertical IN ('music_contractor', 'orchestra_band') AND allow_worker_drop
  ) || ' music organization(s) have drop-out switched on (by an admin since the first run?)' END
UNION ALL
SELECT
  'organizations with auto-offer switched on',
  'INFO - ' || (SELECT count(*) FROM organizations WHERE auto_cascade) || ' of ' || (SELECT count(*) FROM organizations)
UNION ALL
SELECT
  'migration 096 is recorded as applied',
  CASE WHEN EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '096')
    THEN 'PASS' ELSE 'FAIL - tell Claude' END;
