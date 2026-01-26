-- Add Zelle payment tracking for musicians
-- zelle_method: 'email' or 'phone' - which contact to use for Zelle
-- zelle_verified: whether payment info has been confirmed with the musician

ALTER TABLE musicians ADD COLUMN IF NOT EXISTS zelle_method VARCHAR(10) CHECK (zelle_method IN ('email', 'phone'));
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS zelle_verified BOOLEAN DEFAULT FALSE;

-- Index for filtering musicians by payment status
CREATE INDEX IF NOT EXISTS idx_musicians_zelle ON musicians(organization_id, zelle_method, zelle_verified);
