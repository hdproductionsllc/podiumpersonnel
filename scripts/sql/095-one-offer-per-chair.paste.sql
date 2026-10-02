-- ============================================================================
-- PODIUM — ONE OPEN OFFER AND ONE ACCEPTED OFFER PER CHAIR (migration 095, 2026-10-02)
--
-- HOW TO RUN — ONLY AFTER the code that uses migration 094 is deployed
--   0. FIRST run scripts/sql/095-repair-before-unique-indexes.paste.sql and
--      check its RESULTS are all PASS.
--   1. Supabase Dashboard -> SQL Editor -> New query
--   2. Paste this ENTIRE file -> Run
--   3. Read the "RESULTS" table printed at the very bottom. Every row should
--      say PASS. If one says FAIL, paste the whole output back to Claude.
--
-- Safe to run more than once: the second run changes nothing. It runs inside
-- one transaction, so if any statement errors NOTHING is applied — paste the
-- error back to Claude. If the repair script was skipped and a bad row
-- exists, it stops with a message saying so, and changes nothing. It changes
-- no row of your data.
--
-- WHY AFTER THE DEPLOY (the one migration in this step that goes code first)
--   The code before this step, still live until the deploy, breaks these two
--   rules for a moment in normal use: it accepted a substitute by marking
--   them accepted before releasing the original musician, and the Send Offer
--   dialog wrote a chair's new offer before retiring its open one. Pasted
--   before the deploy, those two actions would fail. The new code does both
--   in the safe order inside claim_chair / create_offer (094), and works the
--   same with or without these rules; they are a backstop.
--
-- WHAT IT DOES, in plain English
--   The database itself now refuses a second open offer on a chair
--   (substitutes' offers aside) and a second accepted offer on a chair.
--   Until now only the app's own care prevented these.
--
--   Nothing here changes pay, who is emailed, or what emails say.
--
-- Body below is supabase/migrations/095_one_offer_per_chair.sql, copied
-- verbatim, followed by the migrations-log entry.
-- ============================================================================

BEGIN;

-- 095: one open offer and one accepted offer per chair, enforced by the database
--
-- WHY (architecture audit C, R-1 / R-9 / R-13; target architecture 3.1)
--   Two open offers on one chair, or two accepted offers on one chair, are the
--   states the cascade exists to prevent. claim_chair and create_offer (094)
--   no longer make them; these two indexes make the database refuse them from
--   any writer, so a future bug fails loudly instead of double-booking.
--
-- WHAT CHANGES
--   1. contract_offers_one_live_per_position: at most one pending/viewed offer
--      per chair, not counting substitutes' offers (is_substitution, 093),
--      which are made on a chair someone already holds.
--   2. contract_offers_one_accepted_per_position: at most one accepted offer
--      per chair.
--
-- PASTE THIS AFTER THE CODE THAT USES 094 IS DEPLOYED, not before.
--   The code before that step breaks both indexes in passing: it accepted a
--   substitute by writing their 'accepted' before the original musician's
--   'released', and the Send Offer dialog inserted a new offer before retiring
--   the chair's open one. Under these indexes both of those fail. The new code
--   does both in claim_chair / create_offer, in the safe order.
--
-- BEFORE PASTING
--   Run scripts/sql/095-repair-before-unique-indexes.paste.sql first. It fixes
--   any offers that would break 1-2 (production had none on 2026-10-01) and
--   logs each fix to staffing_events. If a violating row is still there, this
--   migration stops with a plain-English error and changes nothing.
--
-- Idempotent and safe to re-run.

-- ---------------------------------------------------------------------------
-- 0. Refuse to run without 093, or over offers the indexes would reject.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_live int;
  v_accepted int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contract_offers' AND column_name = 'is_substitution'
  ) THEN
    RAISE EXCEPTION 'Migration 095 stopped, nothing was changed: migration 093 (the offer columns, contract_offers.is_substitution) is not applied. Run scripts/sql/093-offer-columns.paste.sql first.';
  END IF;

  SELECT count(*) INTO v_live FROM (
    SELECT project_position_id FROM contract_offers
    WHERE status IN ('pending', 'viewed') AND is_substitution = false
    GROUP BY project_position_id HAVING count(*) > 1
  ) s;
  SELECT count(*) INTO v_accepted FROM (
    SELECT project_position_id FROM contract_offers
    WHERE status = 'accepted'
    GROUP BY project_position_id HAVING count(*) > 1
  ) s;

  IF v_live + v_accepted > 0 THEN
    RAISE EXCEPTION 'Migration 095 stopped, nothing was changed: % chair(s) with two open offers, % with two accepted offers. Run scripts/sql/095-repair-before-unique-indexes.paste.sql first.',
      v_live, v_accepted;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1-2. The indexes
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS contract_offers_one_live_per_position
  ON contract_offers (project_position_id)
  WHERE status IN ('pending', 'viewed') AND is_substitution = false;

CREATE UNIQUE INDEX IF NOT EXISTS contract_offers_one_accepted_per_position
  ON contract_offers (project_position_id)
  WHERE status = 'accepted';

-- ===========================================================================
-- verify:
-- SELECT indexname FROM pg_indexes WHERE indexname IN
--   ('contract_offers_one_live_per_position', 'contract_offers_one_accepted_per_position');   -- 2 rows

-- ---------------------------------------------------------------------------
-- Record that 095 is applied (docs/database-tests.md, "Recording an
-- application"), in the same transaction so it is only recorded if it ran.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('095', '095_one_offer_per_chair')
ON CONFLICT (version) DO NOTHING;

COMMIT;


-- ============================================================================
-- RESULTS — read this table. Every row should say PASS.
-- ============================================================================

SELECT
  'a chair can hold only one open offer' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'contract_offers_one_live_per_position'
      AND indexdef LIKE 'CREATE UNIQUE INDEX%'
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END AS result
UNION ALL
SELECT
  'a chair can hold only one accepted offer',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'contract_offers_one_accepted_per_position'
      AND indexdef LIKE 'CREATE UNIQUE INDEX%'
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'the new code''s functions are there (094 applied first)',
  CASE WHEN to_regprocedure('public.claim_chair(uuid)') IS NOT NULL
        AND to_regprocedure('public.create_offer(uuid, uuid, uuid, timestamptz, numeric, text, jsonb, text, boolean)') IS NOT NULL
    THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'migration 095 is recorded as applied',
  CASE WHEN EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '095')
    THEN 'PASS' ELSE 'FAIL - tell Claude' END;
