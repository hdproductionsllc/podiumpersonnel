-- Ensure call_time is always before or equal to start_time
-- Call time is when musicians arrive; start_time is when the event begins
ALTER TABLE services
ADD CONSTRAINT services_call_time_before_start
CHECK (call_time IS NULL OR call_time <= start_time);
