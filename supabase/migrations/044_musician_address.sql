-- Add address fields to musicians table
ALTER TABLE musicians ADD COLUMN street_address TEXT;
ALTER TABLE musicians ADD COLUMN city TEXT;
ALTER TABLE musicians ADD COLUMN state VARCHAR(2);
