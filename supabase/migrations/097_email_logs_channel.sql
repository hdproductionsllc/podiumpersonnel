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
