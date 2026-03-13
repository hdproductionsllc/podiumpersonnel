-- W-9 admin verification fields
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS w9_verified_at TIMESTAMPTZ;
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS w9_verified_by UUID REFERENCES auth.users(id);

-- Payment audit trail: who marked it paid
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES auth.users(id);

-- Index for 1099 report queries (year-end aggregation by musician)
CREATE INDEX IF NOT EXISTS idx_payments_musician_paid
  ON payments(musician_id, status, payment_date) WHERE status = 'paid';

-- Index for dashboard unpaid payment prompt (past services with unpaid payments)
CREATE INDEX IF NOT EXISTS idx_payments_org_status
  ON payments(organization_id, status) WHERE status = 'unpaid';
