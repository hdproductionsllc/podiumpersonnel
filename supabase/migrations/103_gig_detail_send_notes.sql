-- Keep the notes a gig details send went out with, so a follow-up send to
-- someone added later (an email filled in after the fact, a sub swapped in)
-- repeats them instead of arriving without them. music_sends already has this.
ALTER TABLE gig_detail_sends ADD COLUMN IF NOT EXISTS notes text;
