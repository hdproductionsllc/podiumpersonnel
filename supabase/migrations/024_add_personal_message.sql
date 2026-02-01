-- Add personal message column to contract_offers
ALTER TABLE contract_offers ADD COLUMN IF NOT EXISTS personal_message text;
