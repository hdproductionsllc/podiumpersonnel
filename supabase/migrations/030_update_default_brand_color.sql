-- Update organizations using the old default blue (#3b82f6) to Podium navy (#1E293B)
UPDATE organizations
SET email_brand_color = '#1E293B'
WHERE email_brand_color = '#3b82f6' OR email_brand_color IS NULL;

-- Update the column default for new organizations
ALTER TABLE organizations
  ALTER COLUMN email_brand_color SET DEFAULT '#1E293B';
