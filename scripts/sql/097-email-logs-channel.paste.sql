-- ============================================================================
-- PODIUM — FAILED SENDS ON THE EMAILS PAGE (migration 097, 2026-10-02)
--
-- HOW TO RUN
--   1. Supabase Dashboard -> SQL Editor -> New query
--   2. Paste this ENTIRE file -> Run
--   3. Read the "RESULTS" table printed at the very bottom. Every row should
--      say PASS (INFO rows just report a number). If one says FAIL, paste the
--      whole output back to Claude.
--
-- Safe to run more than once: the second run changes nothing. It runs inside
-- one transaction, so if any statement errors NOTHING is applied — paste the
-- error back to Claude. It deletes nothing and changes no existing row's
-- content: every past email simply gets the label "email".
--
-- RUN IT BEFORE the Release 2 foundations code is deployed (David's rule:
-- data before code). The live app today never uses the new columns, so adding
-- them changes nothing you can see. If the new code ever runs without them,
-- emails still go out exactly as before; a failed send is still recorded, just
-- with the reason tucked into the row's details.
--
-- WHAT IT DOES, in plain English
--
--   The Emails page is the record of what Podium sent for your company. Today,
--   if the email provider refuses a send (an address it rejects, an outage),
--   the app notes it in a server log nobody reads and the Emails page shows
--   nothing, as if the email had never been attempted. After this and the next
--   deploy, that send appears on the Emails page as "failed", with when and why.
--
--   It also labels every row with how the message went: "email". Podium does
--   not send text messages for any company; the label is there so a future
--   "connect your own texting account" uses the same record.
--
--   Nothing about who gets emailed, or what the emails say, changes.
--
-- Body below is supabase/migrations/097_email_logs_channel.sql, copied
-- verbatim, followed by the migrations-log entry.
-- ============================================================================

BEGIN;

-- 097: email_logs records the channel, and the sends that failed
--
-- WHY (the plan, Release 2 A2.1; target architecture section 8 row 22)
--   Every message the app sends now goes through one notify layer
--   (src/lib/notify/). Two things were missing from the audit table it writes:
--     1. Which channel carried the message. Today that is always email, and
--        Podium sends no texts on any company's behalf; the column exists so a
--        later "connect your own texting provider" lands in the same table
--        instead of a second log.
--     2. Sends that failed. Today a send the email provider rejects is caught,
--        printed to the server log and forgotten: the company's Emails page
--        shows nothing at all. From now on such a send is written as a row with
--        status 'failed', when it failed and why.
--
-- WHAT CHANGES
--   channel         text NOT NULL DEFAULT 'email', CHECK in ('email', 'sms').
--                   Every existing row becomes 'email', which is what it was.
--   failed_at       timestamptz NULL. Set only on a failed send.
--   failure_reason  text NULL. The provider's error message, as the app saw it.
--   An index on failed rows, so "what failed recently" stays cheap.
--
--   status keeps its meaning and has no CHECK (038 never had one): 'sent',
--   'suppressed' (safe mode), the webhook's 'delivered' / 'bounced' /
--   'complained', and now 'failed'.
--
-- SAFE AGAINST TODAY'S CODE
--   The live app never names the new columns; its inserts get 'email' and two
--   NULLs, exactly as if the columns were not there. Nothing is deleted or
--   rewritten. The new code copes with this migration being absent: a failed
--   send is still recorded, with the reason in metadata instead.
--
-- Idempotent and safe to re-run.

ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'email';
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS failure_reason TEXT;

ALTER TABLE email_logs DROP CONSTRAINT IF EXISTS email_logs_channel_check;
ALTER TABLE email_logs
  ADD CONSTRAINT email_logs_channel_check CHECK (channel IN ('email', 'sms'));

CREATE INDEX IF NOT EXISTS idx_email_logs_failed
  ON email_logs(organization_id, failed_at DESC)
  WHERE failed_at IS NOT NULL;

COMMENT ON COLUMN email_logs.channel IS
  'How the message went: email (every row before 097, and every row today) | sms (not used: Podium sends no texts).';
COMMENT ON COLUMN email_logs.failed_at IS
  'When the provider rejected the send (097). NULL for every send that went out.';
COMMENT ON COLUMN email_logs.failure_reason IS
  'The provider error for a failed send (097). NULL otherwise.';

-- ===========================================================================
-- verify:
-- SELECT column_name, is_nullable, column_default FROM information_schema.columns
--   WHERE table_name = 'email_logs' AND column_name IN ('channel', 'failed_at', 'failure_reason');
-- SELECT channel, count(*) FROM email_logs GROUP BY channel;  -- only 'email'
-- SELECT sent_at, email_type, recipient_email, failure_reason FROM email_logs
--   WHERE status = 'failed' ORDER BY failed_at DESC LIMIT 20;

-- ---------------------------------------------------------------------------
-- Record that 097 is applied (docs/database-tests.md, "Recording an
-- application"), in the same transaction so it is only recorded if it ran.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('097', '097_email_logs_channel')
ON CONFLICT (version) DO NOTHING;

COMMIT;


-- ============================================================================
-- RESULTS — read this table. Every row should say PASS.
-- ============================================================================

SELECT
  'the three new columns exist' AS check_name,
  CASE WHEN (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'email_logs'
      AND column_name IN ('channel', 'failed_at', 'failure_reason')
  ) = 3 THEN 'PASS' ELSE 'FAIL - a column is missing, tell Claude' END AS result
UNION ALL
SELECT
  'channel is required and defaults to "email"',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'email_logs'
      AND column_name = 'channel' AND is_nullable = 'NO' AND column_default LIKE '''email''%'
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'channel only accepts email / sms',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_logs_channel_check'
      AND conrelid = 'public.email_logs'::regclass
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'every existing row is labelled "email"',
  CASE WHEN NOT EXISTS (SELECT 1 FROM email_logs WHERE channel <> 'email')
    THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'only failed sends carry a failure time',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM email_logs WHERE failed_at IS NOT NULL AND status <> 'failed'
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'migration 097 is recorded as applied',
  CASE WHEN EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '097')
    THEN 'PASS' ELSE 'FAIL - tell Claude' END

-- For information only.
UNION ALL
SELECT
  'INFO: emails on record',
  'INFO - ' || (SELECT count(*) FROM email_logs)::text
UNION ALL
SELECT
  'INFO: failed sends on record',
  'INFO - ' || (SELECT count(*) FROM email_logs WHERE status = 'failed')::text;
