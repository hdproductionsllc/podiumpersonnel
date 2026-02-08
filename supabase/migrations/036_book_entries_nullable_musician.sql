-- Allow book_entries to have NULL musician_id
-- This supports adding instrument slots to an ensemble without a musician assigned yet
ALTER TABLE book_entries ALTER COLUMN musician_id DROP NOT NULL;
