-- 083: Intake "no music" rows (Book Builder — real-usage feedback, 2026-08-26)
--
-- A wedding list can specify that we DON'T play a slot:
--   "Recessional: TACET - DJ will play"
-- TACET is the musical term for "this player is silent". It is an ANSWER, not a
-- song, and it is a third distinct state of an intake row:
--   - not a match failure  — there is nothing to find, so a red "not in library"
--                            flag is wrong and sends the owner hunting;
--   - not a library match  — there are no parts to pull from R2 for the book;
--   - not a special request — nobody is being asked to source or arrange anything.
--
-- It still has to stay VISIBLE. The players need to know the recessional is the
-- DJ's so they stop playing, and that only reaches them if the row survives onto
-- the review screen and the gig details. So the row is kept and marked, never
-- silently dropped — the same reasoning as the parser's never-drop-a-line rule.
--
-- The accompanying detail ("DJ will play") rides in the existing notes column.
--
-- Additive only: one boolean column on intake_songs, default false, so every
-- existing row is untouched and the app's write path works the moment this runs.
-- A no-music row is saved with match_status='manual' and matched_repertoire_id
-- NULL (resolved by explicit decision, no library work attached) plus
-- no_music=true — mirroring how 070 stores a special request.

ALTER TABLE intake_songs
  ADD COLUMN no_music BOOLEAN NOT NULL DEFAULT false;

-- ===========================================================================
-- verify: column exists with the right type/default
-- SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name = 'intake_songs'
--    AND column_name = 'no_music';
-- Expected: one row — boolean, default false, NO.

-- verify: no existing row was flipped
-- SELECT count(*) FROM intake_songs WHERE no_music;
-- Expected: 0.

-- verify: a no-music row never carries a library work
-- SELECT count(*) FROM intake_songs WHERE no_music AND matched_repertoire_id IS NOT NULL;
-- Expected: 0.
