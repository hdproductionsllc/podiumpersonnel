-- Add pay fields to services
ALTER TABLE services ADD COLUMN base_pay DECIMAL(10,2);
ALTER TABLE services ADD COLUMN leader_fee DECIMAL(10,2) DEFAULT 50.00;

-- Add custom pay override to contract offers
ALTER TABLE contract_offers ADD COLUMN custom_pay DECIMAL(10,2);
