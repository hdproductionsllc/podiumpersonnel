-- 096: the switches for auto-cascade and worker drop, and the cascade's idempotency key
--
-- WHY (the plan, Release 1 B1.1 / B1.3; target architecture 4 and 9)
--   Auto-cascade ("when someone says no, offer the chair to the next person")
--   and worker drop ("I can't make it" on the gig page) are new behaviour. Both
--   are off unless an organization chooses them, and auto-cascade can be
--   switched off for a single chair. The cascade itself is later code; this
--   step only adds the switches it will read, and the one database rule that
--   makes it safe to run from two places at once.
--
-- WHAT CHANGES
--   1. organizations.auto_cascade boolean NOT NULL DEFAULT false.
--      OFF for every organization, existing and new.
--   2. organizations.allow_worker_drop boolean NOT NULL.
--      Existing organizations: false for the music verticals
--      (music_contractor, orchestra_band), where the substitute-request flow
--      stays the way out; true for every other vertical. New organizations get
--      the same default from their vertical (trigger set_allow_worker_drop_default,
--      BEFORE INSERT, only when the insert leaves the column out). The music
--      verticals are the ones create_organization_with_owner (067) seeds with
--      the instrument library, and the ones whose template says skillSeeds 'sql'.
--   3. project_positions.auto_cascade_disabled boolean NOT NULL DEFAULT false.
--      The per-chair "don't auto-offer this chair" switch.
--   4. contract_offers.cascaded_from_offer_id uuid NULL, references
--      contract_offers(id) ON DELETE SET NULL. Set only on an offer the cascade
--      made: the offer whose decline, expiry or drop caused it.
--   5. contract_offers_one_cascade_per_trigger: a UNIQUE index on
--      cascaded_from_offer_id. One triggering offer can cause at most one
--      cascaded offer, ever, whoever tries (two cron runs, a decline racing the
--      cron). A triggering offer belongs to exactly one chair, so this is the
--      (chair, triggering offer) key.
--
-- Nothing reads these yet in today's code, and every default reproduces
-- today's behaviour, so this is safe to paste BEFORE the code that uses it
-- (house rule: migration first).
--
-- Idempotent and safe to re-run.

-- ---------------------------------------------------------------------------
-- 0. Refuse to run without the vertical column (065).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'vertical'
  ) THEN
    RAISE EXCEPTION 'Migration 096 stopped, nothing was changed: organizations.vertical (migration 065) is missing.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. auto_cascade: off for everyone
-- ---------------------------------------------------------------------------
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS auto_cascade boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN organizations.auto_cascade IS
  'When true, a declined, expired or dropped offer is automatically offered to the next unconflicted candidate on the same terms. Off by default.';

-- ---------------------------------------------------------------------------
-- 2. allow_worker_drop: by vertical
-- ---------------------------------------------------------------------------
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS allow_worker_drop boolean;

-- Existing rows. Only rows still NULL, so a re-run never overwrites a choice
-- an admin has made since.
UPDATE organizations
   SET allow_worker_drop = (vertical NOT IN ('music_contractor', 'orchestra_band'))
 WHERE allow_worker_drop IS NULL;

-- New rows: a column default cannot read another column, so a BEFORE INSERT
-- trigger fills it from the vertical when the insert leaves it out. NOT NULL
-- is checked after BEFORE triggers run.
CREATE OR REPLACE FUNCTION set_allow_worker_drop_default()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.allow_worker_drop IS NULL THEN
    NEW.allow_worker_drop := COALESCE(NEW.vertical, 'music_contractor') NOT IN ('music_contractor', 'orchestra_band');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_allow_worker_drop_default ON organizations;
CREATE TRIGGER trg_set_allow_worker_drop_default
  BEFORE INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_allow_worker_drop_default();

ALTER TABLE organizations
  ALTER COLUMN allow_worker_drop SET NOT NULL;

COMMENT ON COLUMN organizations.allow_worker_drop IS
  'When true, a worker who accepted can release themselves from the gig page. Defaults to false for music verticals (they request a substitute instead) and true for the others.';

-- ---------------------------------------------------------------------------
-- 3. The per-chair switch
-- ---------------------------------------------------------------------------
ALTER TABLE project_positions
  ADD COLUMN IF NOT EXISTS auto_cascade_disabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN project_positions.auto_cascade_disabled IS
  'True: never auto-offer this chair, even when the organization has auto_cascade on.';

-- ---------------------------------------------------------------------------
-- 4-5. Which offer caused a cascaded offer, at most one per cause
-- ---------------------------------------------------------------------------
ALTER TABLE contract_offers
  ADD COLUMN IF NOT EXISTS cascaded_from_offer_id uuid
    REFERENCES contract_offers(id) ON DELETE SET NULL;

COMMENT ON COLUMN contract_offers.cascaded_from_offer_id IS
  'Set only on an offer the auto-cascade made: the declined, expired or dropped offer that caused it. Unique, so one cause makes at most one cascaded offer.';

CREATE UNIQUE INDEX IF NOT EXISTS contract_offers_one_cascade_per_trigger
  ON contract_offers (cascaded_from_offer_id)
  WHERE cascaded_from_offer_id IS NOT NULL;

-- ===========================================================================
-- verify:
-- SELECT vertical, allow_worker_drop, auto_cascade, count(*) FROM organizations GROUP BY 1, 2, 3;
--   music_contractor / orchestra_band rows: allow_worker_drop false; others true; auto_cascade all false
-- SELECT indexname FROM pg_indexes WHERE indexname = 'contract_offers_one_cascade_per_trigger';   -- 1 row
