-- 069: Intakes (Book Builder Phase B — questionnaire intake import)
--
-- The owner's wedding clients fill a 17hats questionnaire (free text). An admin
-- pastes the submitted text onto a project; Podium PARSES it into sections/songs
-- and MATCHES each song against the org's repertoire library (068). Nothing the
-- parser produces is trusted: an admin reviews and confirms everything on a REVIEW
-- screen before it's saved as final. These two tables are the home for that draft.
--
-- FOOLPROOF = the human-confirm gate. status stays 'draft' until an admin confirms
-- (then 'confirmed' + confirmed_at). raw_text is kept VERBATIM so the paste can be
-- re-parsed or audited later, and recessional_cue is stored EXACTLY as the client
-- wrote it — the cue must never be reworded.
--
-- Additive only. Two org-scoped tables, no changes to existing objects:
--   intakes       — one row per project (the parsed-and-confirmed questionnaire)
--   intake_songs  — one row per proposed song, each with its repertoire match state
--
-- Depends on 068 (repertoire) for intake_songs.matched_repertoire_id.
-- Apply BEFORE deploying the intake import/review code (migration-first house rule).

-- ---------------------------------------------------------------------------
-- 1. intakes — one questionnaire per project, scoped to an org
-- ---------------------------------------------------------------------------
--   project_id is UNIQUE: a project has at most one intake. raw_text holds the
--   pasted questionnaire verbatim (re-parse / audit). processional_order and
--   recessional_cue capture the ceremony ordering the client specified; the cue
--   is stored word-for-word and must never be rewritten.
CREATE TABLE intakes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  source              TEXT NOT NULL DEFAULT '17hats'
                        CHECK (source IN ('17hats','manual','client-form')),
  status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','confirmed')),
  raw_text            TEXT,                                   -- pasted questionnaire, kept verbatim
  contact_name        TEXT,
  contact_phone       TEXT,
  venue_note          TEXT,
  spotify_url         TEXT,
  processional_order  JSONB NOT NULL DEFAULT '[]'::jsonb,     -- array of strings (walk order)
  recessional_cue     TEXT,                                   -- VERBATIM, never reworded
  notes               TEXT,
  confirmed_at        TIMESTAMPTZ,                            -- set when status → 'confirmed'
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_intakes_org ON intakes (organization_id);

-- ---------------------------------------------------------------------------
-- 2. intake_songs — one proposed song per row, with its repertoire match state
-- ---------------------------------------------------------------------------
--   organization_id is denormalized from the parent so RLS is a direct,
--   recursion-free is_org_member()/is_org_admin() check (same reasoning as 068's
--   repertoire_parts). title_raw/artist_raw hold what the parser read from the
--   questionnaire; matched_repertoire_id + match_status hold what it matched to.
--   The match FK is ON DELETE SET NULL: if a repertoire work is removed the draft
--   keeps the raw song text and simply falls back to unmatched, never dangling.
--   (intake_id, section, position) is unique — one song per slot within a section.
CREATE TABLE intake_songs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id             UUID NOT NULL REFERENCES intakes(id) ON DELETE CASCADE,
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  section               TEXT NOT NULL
                          CHECK (section IN ('prelude','ceremony','recessional','postlude','cocktail_hour','reception','other')),
  position              INT NOT NULL,
  title_raw             TEXT,                    -- title as read from the questionnaire
  artist_raw            TEXT,                    -- artist as read from the questionnaire
  role                  TEXT,                    -- ceremony role, e.g. Processional / Bride Entrance
  matched_repertoire_id UUID REFERENCES repertoire(id) ON DELETE SET NULL,
  match_status          TEXT NOT NULL DEFAULT 'missing'
                          CHECK (match_status IN ('matched','ambiguous','missing','manual')),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (intake_id, section, position)
);

CREATE INDEX idx_intake_songs_intake     ON intake_songs (intake_id);
CREATE INDEX idx_intake_songs_org        ON intake_songs (organization_id);
CREATE INDEX idx_intake_songs_repertoire ON intake_songs (matched_repertoire_id);

-- ---------------------------------------------------------------------------
-- 3. updated_at triggers (reuse update_updated_at() from 001)
-- ---------------------------------------------------------------------------
CREATE TRIGGER set_updated_at BEFORE UPDATE ON intakes      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON intake_songs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Row Level Security
--     Members read, admins write, service role full. Service role bypasses RLS
--     automatically in Supabase (same as 068) — the parser/import code runs under
--     the service-role key, so no explicit service-role policy is needed. Both
--     tables carry organization_id, so every check is a direct, recursion-free
--     is_org_member()/is_org_admin() call. Admin ALL policies carry an explicit
--     WITH CHECK (matching siblings 013/053/054) so inserts/updates are held to
--     the same org-admin test as the rows they touch.
-- ---------------------------------------------------------------------------
ALTER TABLE intakes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_songs ENABLE ROW LEVEL SECURITY;

-- intakes
CREATE POLICY "Members can view intakes"
  ON intakes FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admins can manage intakes"
  ON intakes FOR ALL
  USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));

-- intake_songs
CREATE POLICY "Members can view intake songs"
  ON intake_songs FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admins can manage intake songs"
  ON intake_songs FOR ALL
  USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));

-- ===========================================================================
-- verify: both tables exist and RLS is enabled on both
-- SELECT tablename, rowsecurity FROM pg_tables
--  WHERE schemaname = 'public'
--    AND tablename IN ('intakes','intake_songs')
--  ORDER BY tablename;
-- Expected: 2 rows, rowsecurity = t for each.

-- verify: each table has exactly 2 policies (member SELECT + admin ALL)
-- SELECT tablename, count(*) FROM pg_policies
--  WHERE schemaname = 'public'
--    AND tablename IN ('intakes','intake_songs')
--  GROUP BY tablename ORDER BY tablename;
-- Expected: each of the 2 tables → 2.

-- verify: one intake per project (project_id unique)
-- SELECT conname FROM pg_constraint WHERE conname = 'intakes_project_id_key';
-- Expected: one row.

-- verify: one song per (intake, section, position)
-- SELECT conname FROM pg_constraint WHERE conname = 'intake_songs_intake_id_section_position_key';
-- Expected: one row.

-- verify: removing a matched repertoire work nulls the match, never dangles.
-- (run as service role in staging)
-- INSERT INTO repertoire (organization_id, title, ensemble, norm_title)
-- VALUES ('<org>','Canon in D','quartet','canon in d') RETURNING id;   -- <rep>
-- ... create an intake + intake_song with matched_repertoire_id = <rep>, match_status='matched' ...
-- DELETE FROM repertoire WHERE id = '<rep>';
-- SELECT matched_repertoire_id, match_status FROM intake_songs WHERE id = '<song>';
-- Expected: matched_repertoire_id IS NULL, match_status still 'matched' (raw text preserved).
