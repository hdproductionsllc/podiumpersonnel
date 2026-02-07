-- Normalize substitution request statuses
-- Merge legacy 'pending' → 'pending_approval' and 'denied' → 'declined'

-- Step 1: Migrate any existing data using old status values
UPDATE substitution_requests SET status = 'pending_approval' WHERE status = 'pending';
UPDATE substitution_requests SET status = 'declined' WHERE status = 'denied';

-- Step 2: Drop old constraint that includes legacy values
ALTER TABLE substitution_requests
DROP CONSTRAINT IF EXISTS substitution_requests_status_check;

-- Step 3: Add clean constraint with exactly 6 canonical values
ALTER TABLE substitution_requests
ADD CONSTRAINT substitution_requests_status_check
CHECK (status IN ('pending_approval', 'approved', 'declined', 'sub_declined', 'filled', 'cancelled'));
