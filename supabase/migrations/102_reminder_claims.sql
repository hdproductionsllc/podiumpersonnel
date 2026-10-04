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
