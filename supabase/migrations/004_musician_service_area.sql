-- Add service area and call order fields to musicians
ALTER TABLE musicians ADD COLUMN zip_code VARCHAR(10);
ALTER TABLE musicians ADD COLUMN service_radius_miles INTEGER DEFAULT 50;
ALTER TABLE musicians ADD COLUMN call_order INTEGER DEFAULT 100;
ALTER TABLE musicians ADD COLUMN is_leader BOOLEAN DEFAULT FALSE;

-- Index for efficient call order queries
CREATE INDEX idx_musicians_call_order ON musicians(organization_id, call_order);
CREATE INDEX idx_musicians_zip ON musicians(zip_code) WHERE zip_code IS NOT NULL;
