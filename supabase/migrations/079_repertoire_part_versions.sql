-- 079: Keep the old arrangement when a part is replaced
--
-- Replacing a part used to overwrite storage_path/sha256/original_filename in
-- place. The bytes survived in R2 (keys are content-addressed and nothing ever
-- deletes an object), but the RECORD of what the part used to be was gone — no
-- way to see the previous arrangement, compare it, or put it back after a
-- mistaken replace.
--
-- This table is that record. One row per superseded file, written at the moment
-- of replacement, so "replace" becomes "replace and archive the old one".
--
-- Deliberately a separate table rather than a flag on repertoire_parts: the part
-- keeps exactly one live file (the unique index on
-- (repertoire_id, part, substitute, played_on) depends on that), while its
-- history can be any depth.

CREATE TABLE IF NOT EXISTS repertoire_part_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id           UUID NOT NULL REFERENCES repertoire_parts(id) ON DELETE CASCADE,
  repertoire_id     UUID NOT NULL REFERENCES repertoire(id) ON DELETE CASCADE,
  -- Denormalized from the parent so RLS is a direct, recursion-free
  -- is_org_member() check (same reasoning as 041/034/068).
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- What the part pointed at BEFORE the replacement.
  storage_path      TEXT,
  sha256            TEXT,
  bytes             BIGINT,
  original_filename TEXT NOT NULL,

  replaced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  replaced_by       UUID REFERENCES auth.users(id),
  note              TEXT
);

-- History for one part, newest first — the only way this is ever read.
CREATE INDEX IF NOT EXISTS idx_part_versions_part
  ON repertoire_part_versions (part_id, replaced_at DESC);

CREATE INDEX IF NOT EXISTS idx_part_versions_org
  ON repertoire_part_versions (organization_id);

COMMENT ON TABLE repertoire_part_versions IS
  'Superseded files for a repertoire part. Written when a part is replaced so the '
  'previous arrangement can be previewed, downloaded, or restored. The R2 objects '
  'themselves are never deleted (content-addressed keys are shared between parts '
  'holding identical bytes), so a row here is always still openable.';

ALTER TABLE repertoire_part_versions ENABLE ROW LEVEL SECURITY;

-- Org members can read their own history. Writes go through the service role in
-- an API route that authorizes the caller, matching every other library path.
DROP POLICY IF EXISTS "Org members can view part versions" ON repertoire_part_versions;
CREATE POLICY "Org members can view part versions"
  ON repertoire_part_versions FOR SELECT
  USING (is_org_member(organization_id));

-- verify: the table exists with its columns. Expect 11 rows.
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'repertoire_part_versions' ORDER BY ordinal_position;

-- verify: RLS is on and the only policy is the org-scoped read. Expect 1 row,
-- and it must reference organization_id.
-- SELECT policyname, cmd, qual FROM pg_policies
-- WHERE tablename = 'repertoire_part_versions';

-- verify: nothing archived yet (nothing has been replaced since the migration).
-- Expect 0.
-- SELECT count(*) FROM repertoire_part_versions;
