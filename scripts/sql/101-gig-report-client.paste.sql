-- ============================================================================
-- PODIUM — GIG REPORT: HOW DID IT GO WITH THE CLIENT? (migration 101, 2026-10-04)
--
-- HOW TO RUN
--   1. Supabase Dashboard -> SQL Editor -> New query
--   2. Paste this ENTIRE file -> Run
--   3. Read the "RESULTS" table printed at the very bottom. Every row should
--      say PASS (INFO rows just report a number). If one says FAIL, paste the
--      whole output back to Claude.
--
-- Safe to run more than once. It runs inside one transaction, so if any
-- statement errors NOTHING is applied. It deletes nothing and changes no
-- existing report.
--
-- RUN IT BEFORE the next deploy (data before code). The live app today never
-- uses these columns, so adding them changes nothing you can see.
--
-- WHAT IT DOES, in plain English
--
--   The after-gig report gains two quick questions for the gig lead:
--   "Did you interact with the client (couple, host or planner)?" Yes / No,
--   and if yes, "How did it go?" Positive / Neutral / Negative. This adds the
--   two places those answers are kept. Reports already sent stay as they are.
--
-- Body below is supabase/migrations/101_gig_report_client.sql, copied
-- verbatim, followed by the migrations-log entry.
-- ============================================================================

BEGIN;

-- 101: the gig report asks about the client
--
-- WHY (David, 2026-10-04): "I want to know how things went with the client:
-- did they have interaction with the client? positive?" The report had only a
-- free-text "anything to follow up with the client?".
--
-- WHAT CHANGES
--   client_interacted  boolean NULL. Did the gig lead deal with the client
--                      (couple, host or planner)? NULL on reports sent before
--                      this question existed.
--   client_experience  text NULL, 'positive' | 'neutral' | 'negative'. How it
--                      went; only when client_interacted is true.
--
-- Additive: no existing row changes, and nothing in today's app reads or
-- writes these columns. Safe to run more than once.

ALTER TABLE gig_reports ADD COLUMN IF NOT EXISTS client_interacted BOOLEAN;
ALTER TABLE gig_reports ADD COLUMN IF NOT EXISTS client_experience TEXT;

ALTER TABLE gig_reports DROP CONSTRAINT IF EXISTS gig_reports_client_experience_check;
ALTER TABLE gig_reports ADD CONSTRAINT gig_reports_client_experience_check
  CHECK (
    client_experience IS NULL
    OR (client_interacted IS TRUE AND client_experience IN ('positive', 'neutral', 'negative'))
  );

-- ---------------------------------------------------------------------------
-- Record that 101 is applied, in the same transaction so it is only recorded
-- if it ran.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('101', '101_gig_report_client')
ON CONFLICT (version) DO NOTHING;

COMMIT;


-- ============================================================================
-- RESULTS — read this table. Every row should say PASS.
-- ============================================================================

SELECT
  'the two new report columns exist' AS check_name,
  CASE WHEN (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gig_reports'
      AND column_name IN ('client_interacted', 'client_experience')
  ) = 2 THEN 'PASS' ELSE 'FAIL - tell Claude' END AS result
UNION ALL
SELECT
  'how-it-went only accepts positive / neutral / negative, and only after a yes',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gig_reports_client_experience_check'
      AND conrelid = 'public.gig_reports'::regclass
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'migration 101 is recorded as applied',
  CASE WHEN EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '101')
    THEN 'PASS' ELSE 'FAIL - tell Claude' END

-- For information only.
UNION ALL
SELECT
  'INFO: gig reports on record',
  'INFO - ' || (SELECT count(*) FROM gig_reports)::text
UNION ALL
SELECT
  'INFO: reports that answer the client questions',
  'INFO - ' || (SELECT count(*) FROM gig_reports WHERE client_interacted IS NOT NULL)::text;
