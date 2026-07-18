-- 075: Shared music library across a user's brands
--
-- Lets one organization SOURCE its music library from another. When
-- library_org_id is set, the intake / Book Builder flows read AND write the
-- repertoire (repertoire, repertoire_parts, title_aliases, and the R2 part-file
-- key prefix) against the pointed-at org instead of this one. There is still
-- ONE set of song rows and ONE copy of each PDF — the pointer just means several
-- brands see the same shelf, so a change in one is a change for all. No data is
-- copied; storage does not grow.
--
--   NULL  → the org uses its OWN library (today's behavior — unchanged). This is
--           the default, so every existing and future org is walled off until it
--           is EXPLICITLY wired to share. A real customer never inherits another
--           org's library by accident.
--   set   → the org resolves its library to library_org_id (a single hop; the
--           target's own library_org_id must be NULL — no chains).
--
-- Additive and safe to apply anytime. The app resolver (resolveLibraryOrgId in
-- api-helpers) fails OPEN to the org's own id, so the code tolerates this column
-- being absent — but apply this BEFORE wiring any brand (step below) so the
-- pointer takes effect.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS library_org_id UUID NULL REFERENCES organizations(id);

-- An org can't point at itself (NULL already means "use my own library"), which
-- also blocks the trivial self-referential cycle.
ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_library_org_id_not_self;
ALTER TABLE organizations
  ADD CONSTRAINT organizations_library_org_id_not_self
  CHECK (library_org_id IS NULL OR library_org_id <> id);

-- ops (run as a SEPARATE data step, NOT part of this migration): point a brand at
-- the org that holds the master library. Example — share Project String Quartet's
-- library with Subito Strings:
--   UPDATE organizations
--     SET library_org_id = '6edbf230-e43a-42c0-a60d-8cd67be87276'
--     WHERE id = 'acd446d8-3fc9-4f56-99f9-0fc23f8792c6';

-- verify: which orgs share a library, and whose.
--   SELECT child.name AS brand, parent.name AS library_source
--   FROM organizations child
--   JOIN organizations parent ON parent.id = child.library_org_id
--   WHERE child.library_org_id IS NOT NULL;
