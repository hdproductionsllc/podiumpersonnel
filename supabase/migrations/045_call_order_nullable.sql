-- Change call_order default from 100 to NULL
-- Musicians without an explicit call order should show as unranked
ALTER TABLE musicians ALTER COLUMN call_order SET DEFAULT NULL;

-- Convert existing default-100 values to NULL (these were never explicitly set)
UPDATE musicians SET call_order = NULL WHERE call_order = 100;
