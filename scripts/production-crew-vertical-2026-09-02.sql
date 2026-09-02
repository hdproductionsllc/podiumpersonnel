-- ============================================================================
-- PODIUM — PRODUCTION CREW VERTICAL (2026-09-02)
-- HOW TO RUN
--   1. Open the Supabase dashboard for the PRODUCTION project.
--   2. SQL Editor → New query → paste this whole file → Run.
--   3. Read the RESULTS table at the bottom. Every row should say OK.
--   4. Paste the RESULTS back to Claude, or just say "all OK".
--
-- WHAT IT DOES
--   Allows organizations.vertical = 'production_crew'. This is the only
--   database change the Overhire demo needs. Nothing about existing
--   organizations changes. Safe to run twice.
--
-- This is migration 084 verbatim (supabase/migrations/084_add_production_crew_vertical.sql)
-- plus the RESULTS query.
-- ============================================================================

ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_vertical_check;

ALTER TABLE organizations ADD CONSTRAINT organizations_vertical_check
  CHECK (vertical IN (
    'music_contractor',
    'orchestra_band',
    'choir',
    'theatre',
    'dance',
    'church_worship',
    'event_agency',
    'production_crew'
  ));

-- ============================================================================
-- RESULTS
-- ============================================================================
SELECT
  'vertical check allows production_crew' AS check_name,
  CASE
    WHEN pg_get_constraintdef(oid) LIKE '%production_crew%' THEN 'OK'
    ELSE 'ACTION NEEDED: constraint does not list production_crew'
  END AS result
FROM pg_constraint
WHERE conname = 'organizations_vertical_check'
UNION ALL
SELECT
  'existing organizations untouched',
  CASE
    WHEN (SELECT count(*) FROM organizations WHERE vertical NOT IN (
      'music_contractor','orchestra_band','choir','theatre','dance','church_worship','event_agency','production_crew'
    )) = 0 THEN 'OK'
    ELSE 'ACTION NEEDED: an organization has an unknown vertical'
  END;
