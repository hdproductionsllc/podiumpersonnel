-- 084: production_crew vertical (the "Overhire" demo skin)
--
-- Adds 'production_crew' to the allowed organization verticals so a live-event
-- production company can be onboarded onto the same engine under its own
-- terminology and brand. Additive only: every existing org keeps its vertical.
--
-- Apply BEFORE deploying the code that registers the template: the onboarding
-- picker lists the new vertical as soon as the code is live, and choosing it
-- fails at the CHECK constraint until this has run.

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

-- verify: the constraint lists the new key
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'organizations_vertical_check';
-- Expected: ... 'production_crew' ...
