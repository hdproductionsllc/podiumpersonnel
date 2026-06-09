-- Client & booking pipeline fields for projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_email TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_phone TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_amount NUMERIC(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deposit_paid_at DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending'
  CHECK (payment_status IN ('pending', 'deposit_paid', 'fully_paid'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS payment_notes TEXT;
