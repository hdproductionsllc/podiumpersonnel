-- 067: Per-vertical seeding in org creation (V2.0 vertical templates)
--
-- Extends create_organization_with_owner with a p_vertical argument so new
-- organizations record their chosen vertical AND only get the 64-instrument
-- music library when they are actually a music vertical. Non-music verticals
-- (choir/theatre/dance/church_worship/event_agency) have their skills seeded
-- by the app afterward, so the RPC seeds no instruments for them.
--
-- CRITICAL — DROP then CREATE, not CREATE OR REPLACE:
--   CREATE OR REPLACE cannot change a function's argument signature, so it
--   would leave the old 3-arg function in place ALONGSIDE the new 4-arg one.
--   A 3-arg named call (which the currently-deployed onboarding code makes)
--   would then be ambiguous across two candidates and 500 in production the
--   instant this migration applies. We DROP the 3-arg function first, then
--   CREATE the single 4-arg function whose p_vertical default makes the old
--   3-arg call site resolve to it and behave identically to today.
--
-- DEPLOY-GAP SAFETY:
--   After this migration applies but BEFORE the new onboarding code deploys,
--   the live code still calls create_organization_with_owner(p_name, p_slug,
--   p_timezone). That resolves to this 4-arg function via the p_vertical
--   default of 'music_contractor', producing an org + owner membership + the
--   full 64-instrument library — byte-equivalent to today's behavior.

-- 1. Remove the old 3-arg function (also drops its grants).
DROP FUNCTION IF EXISTS create_organization_with_owner(TEXT, TEXT, TEXT);

-- 2. Recreate as a 4-arg function with a vertical, defaulting to music_contractor.
CREATE FUNCTION create_organization_with_owner(
  p_name TEXT,
  p_slug TEXT,
  p_timezone TEXT,
  p_vertical TEXT DEFAULT 'music_contractor'
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_final_slug TEXT := p_slug;
  v_existing UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_existing FROM organizations WHERE slug = v_final_slug;
  IF v_existing IS NOT NULL THEN
    v_final_slug := v_final_slug || '-' || substr(md5(random()::text), 1, 4);
  END IF;

  INSERT INTO organizations (name, slug, timezone, trial_ends_at, vertical)
  VALUES (p_name, v_final_slug, p_timezone, NOW() + INTERVAL '14 days', p_vertical)
  RETURNING id INTO v_org_id;

  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (v_org_id, v_user_id, 'owner');

  -- Auto-populate standard instruments (64 instruments) for music verticals only.
  -- Non-music verticals get their skills seeded by the app after this returns.
  IF p_vertical IN ('music_contractor', 'orchestra_band') THEN
    INSERT INTO instruments (organization_id, name, abbreviation, section, sort_order) VALUES
      -- Strings
      (v_org_id, 'Violin 1', 'Vln 1', 'strings', 100),
      (v_org_id, 'Violin 2', 'Vln 2', 'strings', 101),
      (v_org_id, 'Viola', 'Vla', 'strings', 102),
      (v_org_id, 'Cello', 'Vc', 'strings', 103),
      (v_org_id, 'Double Bass', 'Db', 'strings', 104),
      (v_org_id, 'Harp', 'Hp', 'strings', 105),
      (v_org_id, 'Guitar', 'Gtr', 'strings', 106),
      (v_org_id, 'Electric Guitar', 'EGtr', 'strings', 107),
      (v_org_id, 'Bass Guitar', 'Bass', 'strings', 108),
      (v_org_id, 'Banjo', 'Bnj', 'strings', 109),
      (v_org_id, 'Mandolin', 'Mand', 'strings', 110),
      -- Woodwinds
      (v_org_id, 'Flute', 'Fl', 'woodwinds', 200),
      (v_org_id, 'Piccolo', 'Picc', 'woodwinds', 201),
      (v_org_id, 'Alto Flute', 'AFl', 'woodwinds', 202),
      (v_org_id, 'Bass Flute', 'BFl', 'woodwinds', 203),
      (v_org_id, 'Oboe', 'Ob', 'woodwinds', 204),
      (v_org_id, 'Oboe d''Amore', 'OdA', 'woodwinds', 205),
      (v_org_id, 'English Horn', 'EH', 'woodwinds', 206),
      (v_org_id, 'Clarinet', 'Cl', 'woodwinds', 207),
      (v_org_id, 'Clarinet in A', 'Cl(A)', 'woodwinds', 208),
      (v_org_id, 'Eb Clarinet', 'EbCl', 'woodwinds', 209),
      (v_org_id, 'Bass Clarinet', 'BCl', 'woodwinds', 210),
      (v_org_id, 'Contrabass Clarinet', 'CbCl', 'woodwinds', 211),
      (v_org_id, 'Bassoon', 'Bsn', 'woodwinds', 212),
      (v_org_id, 'Contrabassoon', 'Cbsn', 'woodwinds', 213),
      (v_org_id, 'Soprano Saxophone', 'SSax', 'woodwinds', 214),
      (v_org_id, 'Alto Saxophone', 'ASax', 'woodwinds', 215),
      (v_org_id, 'Tenor Saxophone', 'TSax', 'woodwinds', 216),
      (v_org_id, 'Baritone Saxophone', 'BSax', 'woodwinds', 217),
      (v_org_id, 'Recorder', 'Rec', 'woodwinds', 218),
      -- Brass
      (v_org_id, 'French Horn', 'Hn', 'brass', 300),
      (v_org_id, 'Trumpet', 'Tpt', 'brass', 301),
      (v_org_id, 'Piccolo Trumpet', 'PicTpt', 'brass', 302),
      (v_org_id, 'Cornet', 'Cnt', 'brass', 303),
      (v_org_id, 'Flugelhorn', 'Flug', 'brass', 304),
      (v_org_id, 'Trombone', 'Tbn', 'brass', 305),
      (v_org_id, 'Alto Trombone', 'ATbn', 'brass', 306),
      (v_org_id, 'Bass Trombone', 'BTbn', 'brass', 307),
      (v_org_id, 'Bass Trumpet', 'BTpt', 'brass', 308),
      (v_org_id, 'Euphonium', 'Euph', 'brass', 309),
      (v_org_id, 'Tuba', 'Tba', 'brass', 310),
      (v_org_id, 'Wagner Tuba', 'WTba', 'brass', 311),
      -- Percussion
      (v_org_id, 'Timpani', 'Timp', 'percussion', 400),
      (v_org_id, 'Percussion', 'Perc', 'percussion', 401),
      (v_org_id, 'Snare Drum', 'SD', 'percussion', 402),
      (v_org_id, 'Bass Drum', 'BD', 'percussion', 403),
      (v_org_id, 'Cymbals', 'Cym', 'percussion', 404),
      (v_org_id, 'Tam-tam', 'TT', 'percussion', 405),
      (v_org_id, 'Triangle', 'Tri', 'percussion', 406),
      (v_org_id, 'Tambourine', 'Tamb', 'percussion', 407),
      (v_org_id, 'Crotales', 'Crot', 'percussion', 408),
      (v_org_id, 'Vibraphone', 'Vib', 'percussion', 409),
      (v_org_id, 'Marimba', 'Mar', 'percussion', 410),
      (v_org_id, 'Xylophone', 'Xyl', 'percussion', 411),
      (v_org_id, 'Glockenspiel', 'Glock', 'percussion', 412),
      (v_org_id, 'Chimes', 'Chm', 'percussion', 413),
      (v_org_id, 'Drum Set', 'Drums', 'percussion', 414),
      -- Keyboards & Other
      (v_org_id, 'Piano', 'Pno', 'other', 500),
      (v_org_id, 'Keyboard', 'Kbd', 'other', 501),
      (v_org_id, 'Celesta', 'Cel', 'other', 502),
      (v_org_id, 'Organ', 'Org', 'other', 503),
      (v_org_id, 'Harpsichord', 'Hpd', 'other', 504),
      (v_org_id, 'Synthesizer', 'Synth', 'other', 505),
      (v_org_id, 'Accordion', 'Acc', 'other', 506),
      -- Voices
      (v_org_id, 'Voice - Soprano', 'Sop', 'other', 600),
      (v_org_id, 'Voice - Mezzo-Soprano', 'Mez', 'other', 601),
      (v_org_id, 'Voice - Alto', 'Alto', 'other', 602),
      (v_org_id, 'Voice - Countertenor', 'CTen', 'other', 603),
      (v_org_id, 'Voice - Tenor', 'Ten', 'other', 604),
      (v_org_id, 'Voice - Baritone', 'Bar', 'other', 605),
      (v_org_id, 'Voice - Bass', 'Bas', 'other', 606),
      -- Staff
      (v_org_id, 'Conductor', 'Cond', 'other', 700),
      (v_org_id, 'Music Librarian', 'Lib', 'other', 701);
  END IF;

  RETURN json_build_object(
    'id', v_org_id,
    'name', p_name,
    'slug', v_final_slug,
    'timezone', p_timezone
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Re-grant EXECUTE (DROP removed the old grant).
GRANT EXECUTE ON FUNCTION create_organization_with_owner(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- verify: exactly one create_organization_with_owner function, and it takes 4 args
-- SELECT proname, pronargs, pg_get_function_arguments(oid) AS args
-- FROM pg_proc WHERE proname = 'create_organization_with_owner';
-- Expected: one row, pronargs = 4,
--   args = 'p_name text, p_slug text, p_timezone text, p_vertical text DEFAULT ''music_contractor''::text'

-- verify: a 3-arg named call still resolves (deploy-gap safety) and seeds music_contractor
-- SELECT create_organization_with_owner('Verify Org', 'verify-org-067', 'America/New_York');
-- Expected: JSON with the new org; org.vertical = 'music_contractor'; 64 instruments seeded.

-- verify: 'authenticated' holds EXECUTE on the 4-arg function
-- SELECT has_function_privilege('authenticated',
--   'create_organization_with_owner(text, text, text, text)', 'EXECUTE');
-- Expected: t
