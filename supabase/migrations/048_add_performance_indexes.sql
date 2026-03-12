-- Performance indexes for queries that will degrade as data grows
-- These cover the most common lookup patterns not already indexed

-- Contract offers: lookup by musician and filtering by status
CREATE INDEX IF NOT EXISTS idx_contract_offers_musician ON contract_offers(musician_id);
CREATE INDEX IF NOT EXISTS idx_contract_offers_status ON contract_offers(status);

-- Project positions: lookup by musician (e.g., "what projects is this musician on?")
CREATE INDEX IF NOT EXISTS idx_project_positions_musician ON project_positions(musician_id);

-- Payments: composite for org billing dashboard queries
CREATE INDEX IF NOT EXISTS idx_payments_org_service ON payments(organization_id, service_id);

-- Music confirmations: lookup by send_id for batch status checks
CREATE INDEX IF NOT EXISTS idx_music_confirmations_send ON music_confirmations(send_id);

-- Gig detail confirmations: lookup by send_id
CREATE INDEX IF NOT EXISTS idx_gig_detail_confirmations_send ON gig_detail_confirmations(send_id);
