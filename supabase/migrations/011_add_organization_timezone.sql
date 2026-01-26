-- Add timezone column to organizations
ALTER TABLE organizations
ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles';

-- Add comment for documentation
COMMENT ON COLUMN organizations.timezone IS 'IANA timezone identifier for the organization (e.g., America/Los_Angeles, America/New_York)';
