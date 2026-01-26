-- Add W-9 on file tracking for musicians
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS w9_on_file BOOLEAN DEFAULT FALSE;

-- Index for filtering musicians by W-9 status
CREATE INDEX IF NOT EXISTS idx_musicians_w9_on_file ON musicians(organization_id, w9_on_file);
