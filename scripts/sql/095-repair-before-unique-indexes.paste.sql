-- ============================================================================
-- PODIUM — REPAIR BEFORE THE ONE-OFFER-PER-CHAIR RULES (run BEFORE migration 095)
--
-- HOW TO RUN (only after the code that uses migration 094 is deployed)
--   1. Supabase Dashboard -> SQL Editor -> New query
--   2. Paste this ENTIRE file -> Run
--   3. Read the "RESULTS" table printed at the very bottom. Every row should
--      say PASS (INFO rows just report a number). If one says FAIL, paste the
--      whole output back to Claude and do NOT run 095 yet.
--   4. Then run scripts/sql/095-one-offer-per-chair.paste.sql.
--
-- Safe to run more than once: the second run finds nothing to fix. It runs
-- inside one transaction, so if any statement errors NOTHING is changed —
-- paste the error back to Claude. It deletes nothing.
--
-- WHY
--   Migration 095 makes the database itself refuse two open offers on one
--   chair (not counting substitutes' offers) and two accepted offers on one
--   chair. If any chair is already like that, 095 stops and changes nothing.
--   The checks run on 2026-10-01 found NO such rows in production, so this
--   script is expected to change nothing and report 0 everywhere. It exists
--   for anything the old code left behind before the deploy (its Send Offer
--   dialog wrote a chair's new offer before retiring the old one).
--
-- WHAT IT FIXES, in plain English (each fix is recorded in the staffing
-- history, staffing_events, with reason "repair_095", the before and after,
-- and "system" as who did it, so every change can be reviewed and undone by
-- hand)
--
--   0. Substitutes' offers made by the old code are flagged as substitutes'
--      offers (093's own backfill, repeated), so they are not counted as a
--      chair's second open offer.
--   1. An accepted offer for a chair that someone else holds (or nobody
--      holds): marked "superseded" (replaced). The musician in the chair is
--      untouched.
--   2. Two or more open offers on one chair: the newest stays open, the older
--      ones are marked "superseded", exactly what sending a new offer does.
--
-- Nothing here touches chairs, pay, dates, names, emails or payments, and
-- nobody is emailed.
-- ============================================================================

BEGIN;

-- 0. Substitutes' offers carry the flag (093's backfill, repeated). First, so
--    a substitute's open offer is never counted as a chair's second one.
UPDATE contract_offers o
SET is_substitution = true
WHERE o.is_substitution = false
  AND EXISTS (SELECT 1 FROM substitution_requests r WHERE r.offer_id = o.id);

-- 1. Accepted offers for a chair someone else holds (or nobody) -> superseded.
WITH bad AS (
  SELECT o.id, o.musician_id, o.project_position_id, pp.musician_id AS holder, p.organization_id
  FROM contract_offers o
  JOIN project_positions pp ON pp.id = o.project_position_id
  JOIN projects p ON p.id = pp.project_id
  WHERE o.status = 'accepted' AND pp.musician_id IS DISTINCT FROM o.musician_id
  FOR UPDATE OF o
), fixed AS (
  UPDATE contract_offers o SET status = 'superseded' FROM bad WHERE o.id = bad.id RETURNING o.id
)
INSERT INTO staffing_events (organization_id, actor_type, actor_id, entity_type, entity_id, action, before, after)
SELECT bad.organization_id, 'system', NULL, 'offer', bad.id, 'offer.superseded',
       jsonb_build_object('status', 'accepted'),
       jsonb_build_object('status', 'superseded', 'reason', 'repair_095', 'position_id', bad.project_position_id,
                          'musician_id', bad.musician_id, 'chair_holder', bad.holder)
FROM bad JOIN fixed ON fixed.id = bad.id;

-- 2. Two or more open offers on one chair -> keep the newest.
WITH ranked AS (
  SELECT o.id, o.status, o.musician_id, o.project_position_id, p.organization_id,
         row_number() OVER (PARTITION BY o.project_position_id
                            ORDER BY o.sent_at DESC NULLS LAST, o.created_at DESC, o.id DESC) AS n,
         first_value(o.id) OVER (PARTITION BY o.project_position_id
                                 ORDER BY o.sent_at DESC NULLS LAST, o.created_at DESC, o.id DESC) AS kept
  FROM contract_offers o
  JOIN project_positions pp ON pp.id = o.project_position_id
  JOIN projects p ON p.id = pp.project_id
  WHERE o.status IN ('pending', 'viewed') AND o.is_substitution = false
), bad AS (
  SELECT * FROM ranked WHERE n > 1
), fixed AS (
  UPDATE contract_offers o SET status = 'superseded', responded_at = now() FROM bad WHERE o.id = bad.id RETURNING o.id
)
INSERT INTO staffing_events (organization_id, actor_type, actor_id, entity_type, entity_id, action, before, after)
SELECT bad.organization_id, 'system', NULL, 'offer', bad.id, 'offer.superseded',
       jsonb_build_object('status', bad.status),
       jsonb_build_object('status', 'superseded', 'reason', 'repair_095', 'position_id', bad.project_position_id,
                          'musician_id', bad.musician_id, 'replaced_by', bad.kept)
FROM bad JOIN fixed ON fixed.id = bad.id;

COMMIT;


-- ============================================================================
-- RESULTS — read this table. Every row should say PASS.
-- ============================================================================

SELECT
  'no chair has two open offers' AS check_name,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM contract_offers
    WHERE status IN ('pending', 'viewed') AND is_substitution = false
    GROUP BY project_position_id HAVING count(*) > 1
  ) THEN 'PASS' ELSE 'FAIL - tell Claude, do not run 095' END AS result
UNION ALL
SELECT
  'no chair has two accepted offers',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM contract_offers WHERE status = 'accepted'
    GROUP BY project_position_id HAVING count(*) > 1
  ) THEN 'PASS' ELSE 'FAIL - tell Claude, do not run 095' END
UNION ALL
SELECT
  'every accepted offer belongs to the musician in that chair',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM contract_offers o JOIN project_positions pp ON pp.id = o.project_position_id
    WHERE o.status = 'accepted' AND pp.musician_id IS DISTINCT FROM o.musician_id
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'every substitute''s offer is flagged as one',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM contract_offers o JOIN substitution_requests r ON r.offer_id = o.id
    WHERE NOT o.is_substitution
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END

-- For information only: what this script has ever repaired (all runs).
UNION ALL
SELECT
  'INFO: offers repaired',
  'INFO - ' || (SELECT count(*) FROM staffing_events
                WHERE entity_type = 'offer' AND after->>'reason' = 'repair_095')::text;
