-- Add payment_type column to distinguish standard payments from adjustments/corrections
-- This allows multiple payment records per musician per service (e.g. a correction after the original)
ALTER TABLE payments
ADD COLUMN payment_type VARCHAR(20) NOT NULL DEFAULT 'standard'
CHECK (payment_type IN ('standard', 'adjustment', 'correction', 'bonus'));

-- Drop the old unique constraint that prevented corrections
ALTER TABLE payments
DROP CONSTRAINT IF EXISTS payments_service_id_musician_id_is_leader_fee_key;

-- Add a partial unique index: only one "standard" payment per musician/service/leader combo
CREATE UNIQUE INDEX payments_standard_unique
ON payments (service_id, musician_id, is_leader_fee)
WHERE payment_type = 'standard';
