-- Add home_region column to musicians table
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS home_region VARCHAR(100);

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_musicians_home_region ON musicians(home_region);
