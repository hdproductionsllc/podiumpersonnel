-- Replace create_organization_with_owner to auto-populate standard instruments
CREATE OR REPLACE FUNCTION create_organization_with_owner(
  p_name TEXT,
  p_slug TEXT,
  p_timezone TEXT
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_final_slug TEXT := p_slug;
  v_existing UUID;
BEGIN
  -- Get the authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Ensure slug is unique
  SELECT id INTO v_existing FROM organizations WHERE slug = v_final_slug;
  IF v_existing IS NOT NULL THEN
    v_final_slug := v_final_slug || '-' || substr(md5(random()::text), 1, 4);
  END IF;

  -- Create the organization
  INSERT INTO organizations (name, slug, timezone)
  VALUES (p_name, v_final_slug, p_timezone)
  RETURNING id INTO v_org_id;

  -- Add the user as owner
  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (v_org_id, v_user_id, 'owner');

  -- Auto-populate standard instruments
  INSERT INTO instruments (organization_id, name, abbreviation, section, sort_order) VALUES
    -- Strings
    (v_org_id, 'Violin 1', 'Vln 1', 'strings', 1),
    (v_org_id, 'Violin 2', 'Vln 2', 'strings', 2),
    (v_org_id, 'Viola', 'Vla', 'strings', 3),
    (v_org_id, 'Cello', 'Vc', 'strings', 4),
    (v_org_id, 'Double Bass', 'Db', 'strings', 5),
    (v_org_id, 'Harp', 'Hp', 'strings', 6),
    (v_org_id, 'Guitar', 'Gtr', 'strings', 7),
    (v_org_id, 'Bass Guitar', 'Bass', 'strings', 8),
    (v_org_id, 'Mandolin', 'Mand', 'strings', 9),
    -- Woodwinds
    (v_org_id, 'Flute', 'Fl', 'woodwinds', 10),
    (v_org_id, 'Piccolo', 'Picc', 'woodwinds', 11),
    (v_org_id, 'Alto Flute', 'AFl', 'woodwinds', 12),
    (v_org_id, 'Oboe', 'Ob', 'woodwinds', 13),
    (v_org_id, 'English Horn', 'EH', 'woodwinds', 14),
    (v_org_id, 'Clarinet', 'Cl', 'woodwinds', 15),
    (v_org_id, 'Eb Clarinet', 'EbCl', 'woodwinds', 16),
    (v_org_id, 'Bass Clarinet', 'BCl', 'woodwinds', 17),
    (v_org_id, 'Bassoon', 'Bsn', 'woodwinds', 18),
    (v_org_id, 'Contrabassoon', 'Cbsn', 'woodwinds', 19),
    (v_org_id, 'Alto Saxophone', 'ASax', 'woodwinds', 20),
    (v_org_id, 'Tenor Saxophone', 'TSax', 'woodwinds', 21),
    (v_org_id, 'Baritone Saxophone', 'BSax', 'woodwinds', 22),
    (v_org_id, 'Soprano Saxophone', 'SSax', 'woodwinds', 23),
    (v_org_id, 'Recorder', 'Rec', 'woodwinds', 24),
    -- Brass
    (v_org_id, 'French Horn', 'Hn', 'brass', 30),
    (v_org_id, 'Trumpet', 'Tpt', 'brass', 31),
    (v_org_id, 'Cornet', 'Cnt', 'brass', 32),
    (v_org_id, 'Flugelhorn', 'Flug', 'brass', 33),
    (v_org_id, 'Trombone', 'Tbn', 'brass', 34),
    (v_org_id, 'Bass Trombone', 'BTbn', 'brass', 35),
    (v_org_id, 'Euphonium', 'Euph', 'brass', 36),
    (v_org_id, 'Tuba', 'Tba', 'brass', 37),
    -- Percussion
    (v_org_id, 'Timpani', 'Timp', 'percussion', 40),
    (v_org_id, 'Percussion', 'Perc', 'percussion', 41),
    (v_org_id, 'Snare Drum', 'SD', 'percussion', 42),
    (v_org_id, 'Bass Drum', 'BD', 'percussion', 43),
    (v_org_id, 'Cymbals', 'Cym', 'percussion', 44),
    (v_org_id, 'Vibraphone', 'Vib', 'percussion', 45),
    (v_org_id, 'Marimba', 'Mar', 'percussion', 46),
    (v_org_id, 'Xylophone', 'Xyl', 'percussion', 47),
    (v_org_id, 'Glockenspiel', 'Glock', 'percussion', 48),
    (v_org_id, 'Chimes', 'Chm', 'percussion', 49),
    (v_org_id, 'Drum Set', 'Drums', 'percussion', 50),
    -- Other
    (v_org_id, 'Piano', 'Pno', 'other', 60),
    (v_org_id, 'Keyboard', 'Kbd', 'other', 61),
    (v_org_id, 'Celesta', 'Cel', 'other', 62),
    (v_org_id, 'Organ', 'Org', 'other', 63),
    (v_org_id, 'Harpsichord', 'Hpd', 'other', 64),
    (v_org_id, 'Synthesizer', 'Synth', 'other', 65),
    (v_org_id, 'Accordion', 'Acc', 'other', 66),
    (v_org_id, 'Voice - Soprano', 'Sop', 'other', 70),
    (v_org_id, 'Voice - Alto', 'Alto', 'other', 71),
    (v_org_id, 'Voice - Tenor', 'Ten', 'other', 72),
    (v_org_id, 'Voice - Baritone', 'Bar', 'other', 73),
    (v_org_id, 'Voice - Bass', 'Bas', 'other', 74),
    (v_org_id, 'Conductor', 'Cond', 'other', 80),
    (v_org_id, 'Music Librarian', 'Lib', 'other', 81);

  -- Return the created organization
  RETURN json_build_object(
    'id', v_org_id,
    'name', p_name,
    'slug', v_final_slug,
    'timezone', p_timezone
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
