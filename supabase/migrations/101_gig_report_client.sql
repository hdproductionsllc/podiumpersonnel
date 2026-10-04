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
