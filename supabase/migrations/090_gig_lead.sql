-- 090: One lead per gig
--
-- musicians.is_leader marks people who CAN lead. Every gig has exactly ONE lead
-- (David, 2026-09-27). 089's after-gig report request asked every confirmed
-- musician flagged leader, which on 2026-09-26 asked two people about one
-- wedding. This column names the one lead of the gig.
--
-- NULL = not chosen. The app then uses the only confirmed musician flagged
-- leader when there is exactly one; with two or none it asks an admin to pick,
-- and nobody is asked for a report until they do.
--
-- Additive only: one nullable column. The leader fee is NOT affected.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS gig_lead_musician_id UUID REFERENCES musicians(id) ON DELETE SET NULL;

COMMENT ON COLUMN projects.gig_lead_musician_id IS
  'The one lead of this gig (asked for the after-gig report). NULL = not chosen; the app falls back to the only confirmed is_leader musician, if exactly one.';

-- verify: one row, data_type uuid.
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name = 'projects' AND column_name = 'gig_lead_musician_id';
