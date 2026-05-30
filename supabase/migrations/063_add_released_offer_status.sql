-- Add 'released' as a distinct contract_offer status.
--
-- When a musician who has ACCEPTED a chair requests a substitute and that sub
-- accepts, the original musician's prior accepted offer must move to a terminal
-- state so they are no longer counted as confirmed for that chair. 'released'
-- captures this honestly (distinct from 'declined' = the musician said no, and
-- 'rescinded' = the admin withdrew the offer).

ALTER TABLE contract_offers DROP CONSTRAINT IF EXISTS contract_offers_status_check;

ALTER TABLE contract_offers
  ADD CONSTRAINT contract_offers_status_check
  CHECK (status IN ('pending', 'viewed', 'accepted', 'declined', 'rescinded', 'expired', 'released'));
