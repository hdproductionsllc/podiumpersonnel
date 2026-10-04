-- ============================================================================
-- PODIUM — NO MORE DOUBLE REMINDERS (migration 102, 2026-10-04)
--
-- HOW TO RUN
--   1. Supabase Dashboard -> SQL Editor -> New query
--   2. Paste this ENTIRE file -> Run
--   3. Every row of the RESULTS table at the bottom should say PASS. If one
--      says FAIL, paste the whole output back to Claude.
--
-- Safe to run more than once. One transaction: if anything errors, NOTHING is
-- applied. It deletes nothing and changes no existing row.
--
-- RUN IT BEFORE the next deploy (data before code).
--
-- WHAT IT DOES, in plain English
--
--   On Oct 1 the trio on the Kevin McAndrew gig each got the "please confirm
--   the gig details" reminder twice, four seconds apart: the reminder request
--   reached Podium twice. This adds a "last reminded at" time to each gig-
--   details and music confirmation, so Podium can make sure each person is
--   reminded once, even if the button is pressed twice.
--
-- Body below is supabase/migrations/102_reminder_claims.sql, copied verbatim,
-- followed by the migrations-log entry.
-- ============================================================================

BEGIN;

-- 102: a reminder goes to each person once, however often the button is pressed
--
-- WHY (2026-10-01): a "send reminder" request for a trio's gig details arrived
-- twice, four seconds apart, and all three musicians got the reminder twice.
-- Nothing on the server stopped the second request.
--
-- WHAT CHANGES
--   gig_detail_confirmations.last_reminded_at  timestamptz NULL
--   music_confirmations.last_reminded_at       timestamptz NULL
--   The reminder routes stamp it in one conditional write before sending and
--   skip anyone stamped in the last 10 minutes (src/lib/reminders/claim.ts),
--   so of two requests at once exactly one reaches each person.
--
-- Additive: no existing row changes, and today's app never reads or writes
-- these columns. Safe to run more than once.

ALTER TABLE gig_detail_confirmations ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMPTZ;
ALTER TABLE music_confirmations ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMPTZ;

CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('102', '102_reminder_claims')
ON CONFLICT (version) DO NOTHING;

COMMIT;


-- ============================================================================
-- RESULTS — read this table. Every row should say PASS.
-- ============================================================================

SELECT
  'gig-details confirmations can record when they were last reminded' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gig_detail_confirmations' AND column_name = 'last_reminded_at'
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END AS result
UNION ALL
SELECT
  'music confirmations can record when they were last reminded',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'music_confirmations' AND column_name = 'last_reminded_at'
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'migration 102 is recorded as applied',
  CASE WHEN EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '102')
    THEN 'PASS' ELSE 'FAIL - tell Claude' END;
