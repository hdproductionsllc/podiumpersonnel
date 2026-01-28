-- Add musician_policy field to organizations for customizable policy text
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS musician_policy text;
