-- Expand standard instrument library with commonly-needed orchestral instruments
-- Adds 16 new instruments and renumbers sort_order for better spacing

-- 1. Add missing instruments to ALL existing organizations
INSERT INTO instruments (organization_id, name, abbreviation, section, sort_order)
SELECT o.id, v.name, v.abbreviation, v.section::text, v.sort_order
FROM organizations o
CROSS JOIN (VALUES
  -- Strings
  ('Electric Guitar', 'EGtr', 'strings', 107),
  ('Banjo', 'Bnj', 'strings', 109),
  -- Woodwinds
  ('Bass Flute', 'BFl', 'woodwinds', 203),
  ('Oboe d''Amore', 'OdA', 'woodwinds', 205),
  ('Clarinet in A', 'Cl(A)', 'woodwinds', 208),
  ('Contrabass Clarinet', 'CbCl', 'woodwinds', 211),
  -- Brass
  ('Piccolo Trumpet', 'PicTpt', 'brass', 302),
  ('Alto Trombone', 'ATbn', 'brass', 306),
  ('Bass Trumpet', 'BTpt', 'brass', 308),
  ('Wagner Tuba', 'WTba', 'brass', 311),
  -- Percussion
  ('Tam-tam', 'TT', 'percussion', 405),
  ('Triangle', 'Tri', 'percussion', 406),
  ('Tambourine', 'Tamb', 'percussion', 407),
  ('Crotales', 'Crot', 'percussion', 408),
  -- Voices
  ('Voice - Mezzo-Soprano', 'Mez', 'other', 601),
  ('Voice - Countertenor', 'CTen', 'other', 603)
) AS v(name, abbreviation, section, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM instruments i
  WHERE i.organization_id = o.id AND i.name = v.name
);

-- 2. Update sort_order for existing instruments to use new spacing scheme
-- This ensures consistent ordering across old and new instruments
UPDATE instruments SET sort_order = CASE name
  -- Strings
  WHEN 'Violin 1' THEN 100
  WHEN 'Violin 2' THEN 101
  WHEN 'Viola' THEN 102
  WHEN 'Cello' THEN 103
  WHEN 'Double Bass' THEN 104
  WHEN 'Harp' THEN 105
  WHEN 'Guitar' THEN 106
  WHEN 'Electric Guitar' THEN 107
  WHEN 'Bass Guitar' THEN 108
  WHEN 'Banjo' THEN 109
  WHEN 'Mandolin' THEN 110
  -- Woodwinds
  WHEN 'Flute' THEN 200
  WHEN 'Piccolo' THEN 201
  WHEN 'Alto Flute' THEN 202
  WHEN 'Bass Flute' THEN 203
  WHEN 'Oboe' THEN 204
  WHEN 'Oboe d''Amore' THEN 205
  WHEN 'English Horn' THEN 206
  WHEN 'Clarinet' THEN 207
  WHEN 'Clarinet in A' THEN 208
  WHEN 'Eb Clarinet' THEN 209
  WHEN 'Bass Clarinet' THEN 210
  WHEN 'Contrabass Clarinet' THEN 211
  WHEN 'Bassoon' THEN 212
  WHEN 'Contrabassoon' THEN 213
  WHEN 'Soprano Saxophone' THEN 214
  WHEN 'Alto Saxophone' THEN 215
  WHEN 'Tenor Saxophone' THEN 216
  WHEN 'Baritone Saxophone' THEN 217
  WHEN 'Recorder' THEN 218
  -- Brass
  WHEN 'French Horn' THEN 300
  WHEN 'Trumpet' THEN 301
  WHEN 'Piccolo Trumpet' THEN 302
  WHEN 'Cornet' THEN 303
  WHEN 'Flugelhorn' THEN 304
  WHEN 'Trombone' THEN 305
  WHEN 'Alto Trombone' THEN 306
  WHEN 'Bass Trombone' THEN 307
  WHEN 'Bass Trumpet' THEN 308
  WHEN 'Euphonium' THEN 309
  WHEN 'Tuba' THEN 310
  WHEN 'Wagner Tuba' THEN 311
  -- Percussion
  WHEN 'Timpani' THEN 400
  WHEN 'Percussion' THEN 401
  WHEN 'Snare Drum' THEN 402
  WHEN 'Bass Drum' THEN 403
  WHEN 'Cymbals' THEN 404
  WHEN 'Tam-tam' THEN 405
  WHEN 'Triangle' THEN 406
  WHEN 'Tambourine' THEN 407
  WHEN 'Crotales' THEN 408
  WHEN 'Vibraphone' THEN 409
  WHEN 'Marimba' THEN 410
  WHEN 'Xylophone' THEN 411
  WHEN 'Glockenspiel' THEN 412
  WHEN 'Chimes' THEN 413
  WHEN 'Drum Set' THEN 414
  -- Keyboards
  WHEN 'Piano' THEN 500
  WHEN 'Keyboard' THEN 501
  WHEN 'Celesta' THEN 502
  WHEN 'Organ' THEN 503
  WHEN 'Harpsichord' THEN 504
  WHEN 'Synthesizer' THEN 505
  WHEN 'Accordion' THEN 506
  -- Voices
  WHEN 'Voice - Soprano' THEN 600
  WHEN 'Voice - Mezzo-Soprano' THEN 601
  WHEN 'Voice - Alto' THEN 602
  WHEN 'Voice - Countertenor' THEN 603
  WHEN 'Voice - Tenor' THEN 604
  WHEN 'Voice - Baritone' THEN 605
  WHEN 'Voice - Bass' THEN 606
  -- Staff
  WHEN 'Conductor' THEN 700
  WHEN 'Music Librarian' THEN 701
  ELSE sort_order
END;

-- 3. Replace the organization creation function with the expanded instrument list
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
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_existing FROM organizations WHERE slug = v_final_slug;
  IF v_existing IS NOT NULL THEN
    v_final_slug := v_final_slug || '-' || substr(md5(random()::text), 1, 4);
  END IF;

  INSERT INTO organizations (name, slug, timezone)
  VALUES (p_name, v_final_slug, p_timezone)
  RETURNING id INTO v_org_id;

  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (v_org_id, v_user_id, 'owner');

  -- Auto-populate standard instruments (64 instruments)
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

  RETURN json_build_object(
    'id', v_org_id,
    'name', p_name,
    'slug', v_final_slug,
    'timezone', p_timezone
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
