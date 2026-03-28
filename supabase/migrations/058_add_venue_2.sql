-- Add optional second venue to services for gigs with multiple locations
-- (e.g. ceremony at a church, reception at a resort).
ALTER TABLE services ADD COLUMN venue_2 text;
ALTER TABLE services ADD COLUMN venue_id_2 uuid REFERENCES venues(id) ON DELETE SET NULL;
