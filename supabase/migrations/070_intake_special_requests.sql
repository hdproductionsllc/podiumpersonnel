-- 070: Intake special requests (Book Builder Phase B3 — real-usage feedback)
--
-- Wedding clients can annotate a song with "(*special request*)" in the 17hats
-- questionnaire — meaning "we know it's not in your library; we're asking you to
-- source/arrange it". That is a real, distinct state of an intake song: it is
-- NOT a match failure (nothing to fix) and NOT a library match (nothing to pull
-- from R2 when the book is built). The parser detects the marker and the review
-- screen prompts the admin to mark the row; this column is where that decision
-- lives.
--
-- Additive only: one boolean column on intake_songs, default false, so every
-- existing row is untouched and the app's write path works the moment this runs.
-- A special-request row is saved with match_status='manual' and
-- matched_repertoire_id NULL (resolved by explicit human decision, no library
-- work attached) plus special_request=true.

ALTER TABLE intake_songs
  ADD COLUMN special_request BOOLEAN NOT NULL DEFAULT false;

-- ===========================================================================
-- verify: column exists with the right type/default
-- SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name = 'intake_songs'
--    AND column_name = 'special_request';
-- Expected: one row — boolean, default false, NO.

-- verify: no existing row was flipped
-- SELECT count(*) FROM intake_songs WHERE special_request;
-- Expected: 0.
