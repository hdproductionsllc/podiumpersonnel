-- 065: Organization vertical (V2.0 vertical templates)
--
-- Adds the vertical column that selects an organization's outward-facing
-- template (terminology, nav, skill taxonomy, title rules). Additive only.
-- Every existing organization gets 'music_contractor', which reproduces the
-- pre-verticals UI exactly — zero visible change for live orgs.
--
-- Apply BEFORE deploying the Phase 1 code (code also tolerates this column
-- being absent, but migration-first is the house rule).

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS vertical TEXT NOT NULL DEFAULT 'music_contractor';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_vertical_check'
  ) THEN
    ALTER TABLE organizations ADD CONSTRAINT organizations_vertical_check
      CHECK (vertical IN (
        'music_contractor',
        'orchestra_band',
        'choir',
        'theatre',
        'dance',
        'church_worship',
        'event_agency'
      ));
  END IF;
END $$;

-- verify: every existing org must be music_contractor
-- SELECT vertical, count(*) FROM organizations GROUP BY 1;
-- Expected: one row — ('music_contractor', <number of orgs>)

-- verify: constraint exists
-- SELECT conname FROM pg_constraint WHERE conname = 'organizations_vertical_check';
