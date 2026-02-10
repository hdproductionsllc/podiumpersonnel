-- Add ensemble_type to projects so musicians know the ensemble when receiving offers
ALTER TABLE projects ADD COLUMN ensemble_type TEXT;

-- Backfill existing projects based on name patterns
UPDATE projects SET ensemble_type = 'String Quartet' WHERE name ILIKE '%string quartet%' AND ensemble_type IS NULL;
UPDATE projects SET ensemble_type = 'String Trio' WHERE name ILIKE '%string trio%' AND ensemble_type IS NULL;
UPDATE projects SET ensemble_type = 'Duo' WHERE name ILIKE '%duo%' AND ensemble_type IS NULL;
UPDATE projects SET ensemble_type = 'Solo' WHERE name ILIKE '%solo%' AND ensemble_type IS NULL;
UPDATE projects SET ensemble_type = 'Orchestra' WHERE name ILIKE '%orchestra%' AND ensemble_type IS NULL;
