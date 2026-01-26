-- Enhanced substitution requests for musician-driven workflow
-- Allows musicians to suggest their own subs with contact info

-- Add new columns for suggested sub info
ALTER TABLE substitution_requests
ADD COLUMN IF NOT EXISTS suggested_sub_name TEXT,
ADD COLUMN IF NOT EXISTS suggested_sub_email TEXT,
ADD COLUMN IF NOT EXISTS suggested_sub_phone TEXT,
ADD COLUMN IF NOT EXISTS suggested_sub_instrument_id UUID REFERENCES instruments(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS admin_notes TEXT,
ADD COLUMN IF NOT EXISTS offer_id UUID REFERENCES contract_offers(id) ON DELETE SET NULL;

-- Drop old status constraint and add new one with expanded statuses
ALTER TABLE substitution_requests
DROP CONSTRAINT IF EXISTS substitution_requests_status_check;

ALTER TABLE substitution_requests
ADD CONSTRAINT substitution_requests_status_check
CHECK (status IN ('pending_approval', 'approved', 'declined', 'sub_declined', 'filled', 'cancelled', 'pending', 'denied'));
-- Note: 'pending' and 'denied' kept for backwards compatibility with existing data

-- Add index for looking up substitution requests by offer
CREATE INDEX IF NOT EXISTS idx_substitution_requests_offer_id ON substitution_requests(offer_id);
