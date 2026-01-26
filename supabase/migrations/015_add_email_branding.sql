-- Add email branding fields to organizations table
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS email_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS email_brand_color VARCHAR(7) DEFAULT '#3b82f6',
  ADD COLUMN IF NOT EXISTS email_footer_text TEXT;

-- Add comment for documentation
COMMENT ON COLUMN organizations.email_logo_url IS 'URL of the logo to display in email headers';
COMMENT ON COLUMN organizations.email_brand_color IS 'Hex color code for email buttons and accents (e.g., #3b82f6)';
COMMENT ON COLUMN organizations.email_footer_text IS 'Custom footer text for emails';
