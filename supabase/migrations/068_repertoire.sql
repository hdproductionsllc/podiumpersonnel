-- 068: Repertoire library (Book Builder Phase A — repertoire import)
--
-- The sheet-music library (3,637 PDFs across quartet/trio/duo/solo folders) is
-- imported into Podium: file BYTES go to Cloudflare R2 (external, S3-compatible),
-- and METADATA lands here. These tables are the metadata home.
--
-- Additive only. Three org-scoped tables, no changes to existing objects:
--   repertoire       — one row per (title, artist, ensemble) work
--   repertoire_parts — one row per playable part PDF (vln1/vln2/vla/vc/…)
--   title_aliases    — manual "messy title → canonical work" remap dictionary
--
-- STORAGE NOTE: PDFs live in Cloudflare R2, NOT Supabase Storage. There is no
-- storage.buckets row here (contrast 041_project_files). repertoire_parts.
-- storage_path is the R2 object key; fidelity (byte-identical upload) is enforced
-- by the importer via sha256, not by the database.
--
-- Apply BEFORE deploying the import/book-builder code (migration-first house rule).

-- ---------------------------------------------------------------------------
-- 1. repertoire — one row per musical work, scoped to an org
-- ---------------------------------------------------------------------------
CREATE TABLE repertoire (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,             -- display title, original casing preserved
  artist          TEXT,                      -- filename artist canon; NULL for score-only/unknown
  ensemble        TEXT NOT NULL DEFAULT 'other'
                    CHECK (ensemble IN ('quartet','quintet','trio','duo','solo','viola-trio','other')),
  norm_title      TEXT NOT NULL,             -- normalized title for matching (unicode-folded, lowercased)
  tags            TEXT[] NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Identity of a work within an org = (normalized title, artist, ensemble).
-- artist is NULL-able, so we key on coalesce(artist,'') to make NULLs collide
-- with each other (a plain UNIQUE would treat every NULL artist as distinct and
-- let unlimited "score-only, no artist" duplicates of the same title through).
-- ensemble is part of the key ON PURPOSE: the same title+artist arranged for
-- BOTH quartet AND trio is two legitimate works — two rows — not a collision.
CREATE UNIQUE INDEX repertoire_identity_uidx
  ON repertoire (organization_id, norm_title, coalesce(artist, ''), ensemble);

-- Matching / browse support.
CREATE INDEX idx_repertoire_org_norm_title ON repertoire (organization_id, norm_title);
CREATE INDEX idx_repertoire_tags           ON repertoire USING GIN (tags);

-- ---------------------------------------------------------------------------
-- 2. repertoire_parts — one PDF part per row (the actual R2 objects)
-- ---------------------------------------------------------------------------
--   organization_id is denormalized from the parent so RLS can be a direct,
--   recursion-free is_org_member() check (same reasoning as 041/034).
--   storage_path is NULL-able ON PURPOSE: the importer indexes metadata + sha256
--   FIRST (R2 credentials are not yet provisioned), then backfills storage_path
--   once bytes are uploaded and the post-upload sha256 re-check passes.
CREATE TABLE repertoire_parts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repertoire_id     UUID NOT NULL REFERENCES repertoire(id) ON DELETE CASCADE,
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  part              TEXT NOT NULL
                      CHECK (part IN ('vln1','vln2','vla','vc','bass','voice','organ','other','score')),
  substitute        BOOLEAN NOT NULL DEFAULT false,  -- part covering a line it isn't named for
  played_on         TEXT,                            -- the line it actually covers, e.g. 'vc' for a "vla for vc"
  storage_path      TEXT,                            -- R2 object key; NULL until bytes uploaded + verified
  original_filename TEXT NOT NULL,                   -- exact on-disk name, unicode PRESERVED (never our canon)
  bytes             BIGINT,                          -- file size; NULL until measured/uploaded
  sha256            TEXT,                            -- lowercase hex; recorded at index, re-verified post-upload
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One canonical part per role within a work. substitute + played_on are in the
-- key so a normal viola part (part='vla', substitute=false, played_on=NULL) and
-- a viola-covering-cello sub (part='vla', substitute=true, played_on='vc') both
-- coexist without colliding. coalesce(played_on,'') gives NULL a single bucket
-- (a bare UNIQUE would let unlimited NULL-played_on rows through, defeating the
-- dedup the library needs — 64 basenames repeat across folders).
--
-- Chosen over a filename-based key on purpose: the same work's vln1 appears
-- under several messy filenames ("(1)" dupes, Naughtin suffixes), and this key
-- folds them to one part. When the importer hits this key with a DIFFERENT
-- sha256 (genuinely different content, not a byte-dupe), that's a real conflict
-- it must surface for manual review rather than silently drop — the DB's job
-- here is to guarantee one part per role, and sha256 is what tells identical
-- bytes apart from a true clash.
CREATE UNIQUE INDEX repertoire_parts_role_uidx
  ON repertoire_parts (repertoire_id, part, substitute, coalesce(played_on, ''));

CREATE INDEX idx_repertoire_parts_repertoire ON repertoire_parts (repertoire_id);
CREATE INDEX idx_repertoire_parts_org        ON repertoire_parts (organization_id);
CREATE INDEX idx_repertoire_parts_sha256     ON repertoire_parts (sha256);

-- ---------------------------------------------------------------------------
-- 3. title_aliases — manual remap dictionary ("messy title" → canonical work)
-- ---------------------------------------------------------------------------
--   e.g. alias_norm 'love theme from the godfather' → the "Godfather Theme" row.
CREATE TABLE title_aliases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  alias_norm      TEXT NOT NULL,   -- normalized alias, same normalization as repertoire.norm_title
  repertoire_id   UUID NOT NULL REFERENCES repertoire(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, alias_norm)
);

CREATE INDEX idx_title_aliases_repertoire ON title_aliases (repertoire_id);

-- ---------------------------------------------------------------------------
-- 4. updated_at triggers (reuse update_updated_at() from 001)
-- ---------------------------------------------------------------------------
CREATE TRIGGER set_updated_at BEFORE UPDATE ON repertoire       FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON repertoire_parts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON title_aliases    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Row Level Security
--     Members read, admins write, service role full. Service role bypasses RLS
--     automatically in Supabase (same as 039/064) — the importer runs under the
--     service-role key, so no explicit service-role policy is needed. All three
--     tables carry organization_id, so every check is a direct, recursion-free
--     is_org_member()/is_org_admin() call.
-- ---------------------------------------------------------------------------
ALTER TABLE repertoire       ENABLE ROW LEVEL SECURITY;
ALTER TABLE repertoire_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE title_aliases    ENABLE ROW LEVEL SECURITY;

-- repertoire
CREATE POLICY "Members can view repertoire"
  ON repertoire FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admins can manage repertoire"
  ON repertoire FOR ALL
  USING (is_org_admin(organization_id));

-- repertoire_parts
CREATE POLICY "Members can view repertoire parts"
  ON repertoire_parts FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admins can manage repertoire parts"
  ON repertoire_parts FOR ALL
  USING (is_org_admin(organization_id));

-- title_aliases
CREATE POLICY "Members can view title aliases"
  ON title_aliases FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admins can manage title aliases"
  ON title_aliases FOR ALL
  USING (is_org_admin(organization_id));

-- ===========================================================================
-- verify: three tables exist and RLS is enabled on all three
-- SELECT tablename, rowsecurity FROM pg_tables
--  WHERE schemaname = 'public'
--    AND tablename IN ('repertoire','repertoire_parts','title_aliases')
--  ORDER BY tablename;
-- Expected: 3 rows, rowsecurity = t for each.

-- verify: every table has exactly 2 policies (member SELECT + admin ALL)
-- SELECT tablename, count(*) FROM pg_policies
--  WHERE schemaname = 'public'
--    AND tablename IN ('repertoire','repertoire_parts','title_aliases')
--  GROUP BY tablename ORDER BY tablename;
-- Expected: each of the 3 tables → 2.

-- verify: identity key folds NULL artists together but keeps ensembles apart.
-- Same title+artist in quartet AND trio must be allowed (2 rows); a second
-- identical-ensemble insert must be rejected. (run as service role in staging)
-- INSERT INTO repertoire (organization_id, title, artist, ensemble, norm_title)
-- VALUES ('<org>','Arioso','J.S. Bach','quartet','arioso'),
--        ('<org>','Arioso','J.S. Bach','trio','arioso');   -- both succeed
-- INSERT INTO repertoire (organization_id, title, artist, ensemble, norm_title)
-- VALUES ('<org>','Arioso','J.S. Bach','quartet','arioso'); -- must raise unique_violation

-- verify: part role key separates a normal viola from a viola-covering-cello sub
-- and dedups a repeated normal part.
-- INSERT INTO repertoire_parts (repertoire_id, organization_id, part, original_filename)
-- VALUES ('<rep>','<org>','vla','X - Y - vla.pdf');            -- ok
-- INSERT INTO repertoire_parts (repertoire_id, organization_id, part, substitute, played_on, original_filename)
-- VALUES ('<rep>','<org>','vla', true, 'vc', 'X - Y - vla for vc.pdf'); -- ok (distinct role)
-- INSERT INTO repertoire_parts (repertoire_id, organization_id, part, original_filename)
-- VALUES ('<rep>','<org>','vla','X - Y - vla (1).pdf');        -- must raise unique_violation

-- verify: alias uniqueness per org
-- SELECT conname FROM pg_constraint WHERE conname = 'title_aliases_organization_id_alias_norm_key';
-- Expected: one row.
