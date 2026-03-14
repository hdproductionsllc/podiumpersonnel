-- Add coordinator/venue contact fields to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS coordinator_name text,
  ADD COLUMN IF NOT EXISTS coordinator_email text,
  ADD COLUMN IF NOT EXISTS coordinator_phone text;
