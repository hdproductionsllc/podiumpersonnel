-- Add call_time column to services table
-- Call time is when musicians should arrive, distinct from start_time (performance/rehearsal start)
ALTER TABLE services ADD COLUMN call_time timestamptz;
