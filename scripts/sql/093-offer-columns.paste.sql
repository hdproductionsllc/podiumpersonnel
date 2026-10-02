-- ============================================================================
-- PODIUM — OFFER COLUMNS (migration 093, 2026-10-02)
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
-- error back to Claude. It deletes nothing. The only rows it changes are
-- substitutes' offers, which get a new "this is a substitute's offer" flag
-- set to yes; no status, pay amount, date or name is touched.
--
-- RUN IT BEFORE the code that sends offers from the server is deployed
-- (David's rule: data before code). The live app today never uses the new
-- columns, so adding them changes nothing you can see. If the new code ever
-- runs without them, offers still go out; it just records less and logs a
-- warning.
--
-- WHAT IT DOES, in plain English
--
--   1. A new offer status, "superseded" (shown as "Replaced"). Today, when you
--      send a chair to someone new, the previous person's open offer is marked
--      "expired" — the same word used when someone simply never answered. From
--      the next deploy it says "replaced" instead, so you can tell the two
--      apart. Old offers keep the label they have.
--   2. Four new facts on every offer from now on:
--        - which admin sent it;
--        - a copy of the services and pay the musician was offered, as of the
--          moment it went out (so a later change to the gig does not rewrite
--          what was offered);
--        - whether the offer email was sent, failed, or was held back by safe
--          mode;
--        - whether it is a substitute's offer (made when you approve a sub
--          request). Past substitute offers are found and marked now.
--   Nothing here changes pay. The offer's agreed amount stays the fee for the
--   whole gig, exactly as today.
--
-- Body below is supabase/migrations/093_offer_columns.sql, copied verbatim,
-- followed by the migrations-log entry.
-- ============================================================================

BEGIN;

-- 093: offer columns — 'superseded' status, who sent it, what was offered, how
-- the email went, and whether it is a substitute's offer
--
-- WHY (architecture audit C, sections 6.1 and 10.2)
--   1. A replaced offer was written as 'expired', the same word the cron uses
--      for an offer nobody answered in time. "Timed out" and "replaced by a
--      newer offer" could not be told apart, in the app or in a report.
--   2. Nothing said which admin sent an offer.
--   3. Nothing kept the services and pay the musician was shown when the offer
--      went out; if the gig's services changed later, the offer row could not
--      say what was originally agreed.
--   4. An offer whose email failed looked exactly like one that was delivered.
--   5. A substitute's offer (made when an admin approves a sub request) looked
--      like any other offer on the chair. Later constraints (094: one live
--      offer per chair) must leave those out, so the row has to say so itself.
--
-- WHAT CHANGES
--   status            the CHECK gains 'superseded'. Existing rows are untouched:
--                     old replaced offers stay 'expired'; the new code writes
--                     'superseded' from now on.
--   created_by        auth user id of the admin who sent the offer. NULL for
--                     every existing row and for offers the system makes. Not a
--                     foreign key, like staffing_events.actor_id: the record of
--                     who sent it should outlive that login.
--   terms_snapshot    the services and pay offered, as JSON, at send time. NULL
--                     for existing rows.
--   delivery_status   'queued' | 'sent' | 'failed' | 'suppressed' for the offer
--                     email. NULL = no email was attempted (or an existing row).
--   is_substitution   true for an offer made to a substitute through an
--                     approved sub request. Backfilled below from
--                     substitution_requests.offer_id.
--
--   There is deliberately NO pay_basis column: contract_offers.custom_pay is
--   the fee for the whole gig, owed once (src/lib/payments/compute.ts), and
--   that is not changing here.
--
-- SAFE AGAINST TODAY'S CODE
--   Every new column is nullable or has a default, and the live app never
--   names them, so its inserts and updates behave exactly as before. The status
--   list only grows. The new code also copes with this migration being absent:
--   it falls back to 'expired' and leaves the new columns out (and says so in
--   the logs).
--
-- Idempotent and safe to re-run.

-- 1. 'superseded' joins the status list (063 was the last change to it).
ALTER TABLE contract_offers DROP CONSTRAINT IF EXISTS contract_offers_status_check;
ALTER TABLE contract_offers
  ADD CONSTRAINT contract_offers_status_check
  CHECK (status IN ('pending', 'viewed', 'accepted', 'declined', 'rescinded', 'expired', 'released', 'superseded'));

-- 2. Who sent it, what it offered, how the email went.
ALTER TABLE contract_offers ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE contract_offers ADD COLUMN IF NOT EXISTS terms_snapshot JSONB;
ALTER TABLE contract_offers ADD COLUMN IF NOT EXISTS delivery_status TEXT;

ALTER TABLE contract_offers DROP CONSTRAINT IF EXISTS contract_offers_delivery_status_check;
ALTER TABLE contract_offers
  ADD CONSTRAINT contract_offers_delivery_status_check
  CHECK (delivery_status IN ('queued', 'sent', 'failed', 'suppressed'));

-- 3. Substitute offers say so.
ALTER TABLE contract_offers ADD COLUMN IF NOT EXISTS is_substitution BOOLEAN NOT NULL DEFAULT false;

UPDATE contract_offers o
SET is_substitution = true
WHERE o.is_substitution = false
  AND EXISTS (SELECT 1 FROM substitution_requests r WHERE r.offer_id = o.id);

COMMENT ON COLUMN contract_offers.created_by IS
  'auth user id of the admin who sent the offer (093). NULL for system-made and pre-093 offers.';
COMMENT ON COLUMN contract_offers.terms_snapshot IS
  'Services and pay offered, as shown at send time (093). NULL before 093.';
COMMENT ON COLUMN contract_offers.delivery_status IS
  'Offer email: queued | sent | failed | suppressed (093). NULL = no email attempted.';
COMMENT ON COLUMN contract_offers.is_substitution IS
  'True for an offer made to a substitute via an approved substitution request (093, backfilled).';

-- ===========================================================================
-- verify:
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'contract_offers_status_check';  -- has 'superseded'
-- SELECT column_name, is_nullable, column_default FROM information_schema.columns
--   WHERE table_name = 'contract_offers'
--     AND column_name IN ('created_by', 'terms_snapshot', 'delivery_status', 'is_substitution');
-- SELECT count(*) FROM contract_offers o JOIN substitution_requests r ON r.offer_id = o.id
--   WHERE NOT o.is_substitution;  -- 0

-- ---------------------------------------------------------------------------
-- Record that 093 is applied (docs/database-tests.md, "Recording an
-- application"), in the same transaction so it is only recorded if it ran.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('093', '093_offer_columns')
ON CONFLICT (version) DO NOTHING;

COMMIT;


-- ============================================================================
-- RESULTS — read this table. Every row should say PASS.
-- ============================================================================

SELECT
  'offers can be marked "superseded" (replaced)' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contract_offers_status_check'
      AND conrelid = 'public.contract_offers'::regclass
      AND pg_get_constraintdef(oid) LIKE '%superseded%'
  ) THEN 'PASS' ELSE 'FAIL - status list not updated, tell Claude' END AS result
UNION ALL
SELECT
  'every status the app already uses is still allowed',
  CASE WHEN (
    SELECT bool_and(pg_get_constraintdef(c.oid) LIKE '%''' || s || '''%')
    FROM pg_constraint c,
         unnest(ARRAY['pending', 'viewed', 'accepted', 'declined', 'rescinded', 'expired', 'released']) AS s
    WHERE c.conname = 'contract_offers_status_check'
      AND c.conrelid = 'public.contract_offers'::regclass
  ) THEN 'PASS' ELSE 'FAIL - tell Claude NOW' END
UNION ALL
SELECT
  'the four new columns exist',
  CASE WHEN (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contract_offers'
      AND column_name IN ('created_by', 'terms_snapshot', 'delivery_status', 'is_substitution')
  ) = 4 THEN 'PASS' ELSE 'FAIL - a column is missing, tell Claude' END
UNION ALL
SELECT
  'there is no pay_basis column (pay stays as it is)',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contract_offers' AND column_name = 'pay_basis'
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'the email status only accepts queued / sent / failed / suppressed',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contract_offers_delivery_status_check'
      AND conrelid = 'public.contract_offers'::regclass
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'the substitute flag is required and defaults to "no"',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contract_offers'
      AND column_name = 'is_substitution' AND is_nullable = 'NO' AND column_default = 'false'
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'every past substitute offer is marked as one',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM contract_offers o JOIN substitution_requests r ON r.offer_id = o.id
    WHERE NOT o.is_substitution
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'migration 093 is recorded as applied',
  CASE WHEN EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '093')
    THEN 'PASS' ELSE 'FAIL - tell Claude' END

-- For information only.
UNION ALL
SELECT
  'INFO: offers marked as a substitute''s offer',
  'INFO - ' || (SELECT count(*) FROM contract_offers WHERE is_substitution)::text
UNION ALL
SELECT
  'INFO: offers marked "superseded" so far',
  'INFO - ' || (SELECT count(*) FROM contract_offers WHERE status = 'superseded')::text;
