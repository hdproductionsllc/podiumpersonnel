-- Add 'rescinded' as a distinct contract_offer status.
-- 'declined' = the musician declined the offer.
-- 'rescinded' = the admin withdrew the offer (musician never declined it).
-- Keeping the two separate preserves accurate history and lets emails/UI speak honestly.

ALTER TABLE contract_offers DROP CONSTRAINT IF EXISTS contract_offers_status_check;

ALTER TABLE contract_offers
  ADD CONSTRAINT contract_offers_status_check
  CHECK (status IN ('pending', 'viewed', 'accepted', 'declined', 'rescinded', 'expired'));
