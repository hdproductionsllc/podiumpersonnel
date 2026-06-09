-- Backfill venue_id on services that have a venue name but no FK link.
-- Matches by exact name against venues in the same organization.
-- This prevents name-only Google Maps URLs that can resolve to the wrong location.

-- Venue 1
UPDATE services s
SET venue_id = v.id
FROM venues v, projects p
WHERE p.id = s.project_id
  AND s.venue IS NOT NULL
  AND s.venue_id IS NULL
  AND v.name = s.venue
  AND v.organization_id = p.organization_id;

-- Venue 2
UPDATE services s
SET venue_id_2 = v.id
FROM venues v, projects p
WHERE p.id = s.project_id
  AND s.venue_2 IS NOT NULL
  AND s.venue_id_2 IS NULL
  AND v.name = s.venue_2
  AND v.organization_id = p.organization_id;
