-- Track when automated 24-hour reminder was sent to avoid double-sending
ALTER TABLE contract_offers ADD COLUMN reminder_sent_at TIMESTAMPTZ;
