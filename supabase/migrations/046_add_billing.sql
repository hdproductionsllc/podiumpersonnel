-- Add billing columns to organizations for Stripe subscription management
ALTER TABLE organizations
  ADD COLUMN plan_tier TEXT NOT NULL DEFAULT 'trial'
    CHECK (plan_tier IN ('trial', 'free', 'pro')),
  ADD COLUMN trial_ends_at TIMESTAMPTZ,
  ADD COLUMN stripe_customer_id TEXT UNIQUE,
  ADD COLUMN stripe_subscription_id TEXT UNIQUE,
  ADD COLUMN subscription_status TEXT
    CHECK (subscription_status IN (
      'active', 'past_due', 'canceled', 'incomplete',
      'incomplete_expired', 'trialing', 'unpaid', 'paused'
    ));

-- Backfill existing orgs: give them 14-day trial starting now
UPDATE organizations
SET trial_ends_at = NOW() + INTERVAL '14 days'
WHERE trial_ends_at IS NULL;

-- Replace create_organization_with_owner to set trial_ends_at on new orgs
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

  INSERT INTO organizations (name, slug, timezone, trial_ends_at)
  VALUES (p_name, v_final_slug, p_timezone, NOW() + INTERVAL '14 days')
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
