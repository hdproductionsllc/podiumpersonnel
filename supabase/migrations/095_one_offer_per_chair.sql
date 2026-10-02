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
