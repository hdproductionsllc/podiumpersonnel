-- 092: staffing_events — the history of who did what to an offer, a chair or a
-- substitution request
--
-- WHY (architecture audit C, section 8)
--   contract_offers, project_positions and substitution_requests keep only
--   their CURRENT status: every transition overwrites the last one, and no
--   column says who made it. A direct assignment or a book import leaves no
--   trace at all. So "why did Mike get this job, and who decided?" has no
--   answer. From this migration on, the app writes one row here for every
--   transition (src/lib/staffing/events.ts, logEvent()).
--
-- SHAPE
--   organization_id  whose history it is (the tenant key; RLS reads it)
--   actor_type       'admin' | 'musician' | 'system' (the expire cron)
--   actor_id         auth user id for an admin, musicians.id for a musician,
--                    NULL for the system
--   entity_type      'offer' | 'position' | 'substitution_request' today; not
--                    CHECKed so later steps (requirements, assignments) can add
--                    kinds without a migration
--   entity_id        that row's id. Deliberately NOT a foreign key: history
--                    must outlive a deleted chair or offer.
--   action           e.g. 'offer.accepted', 'position.unassigned'
--   before / after   the fields that changed (jsonb), small
--
-- WHO CAN WRITE
--   Nobody from a browser. There is no INSERT, UPDATE or DELETE policy, and the
--   client roles lose those privileges outright, so the history cannot be
--   edited from a session. The server writes with the service role (logEvent),
--   and future database functions (claim_chair, create_offer) call
--   log_staffing_event(), a SECURITY DEFINER helper only the service role may
--   execute. Org admins can READ their own organization's history.
--
-- Additive only: one new table, one function. Nothing existing is altered, so
-- the code that is live today is unaffected, and the new code tolerates this
-- table being absent (logEvent logs the failure and carries on).
--
-- Idempotent and safe to re-run.

CREATE TABLE IF NOT EXISTS staffing_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_type       TEXT NOT NULL CHECK (actor_type IN ('admin', 'musician', 'system')),
  actor_id         UUID,
  entity_type      TEXT NOT NULL,
  entity_id        UUID NOT NULL,
  action           TEXT NOT NULL,
  before           JSONB,
  after            JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE staffing_events IS
  'Append-only staffing history: one row per offer / chair / substitution transition. Written by the server only (service role or log_staffing_event()).';

-- "What happened in my org lately" and "everything that happened to this row".
CREATE INDEX IF NOT EXISTS staffing_events_org_created_idx
  ON staffing_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS staffing_events_entity_idx
  ON staffing_events (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Row Level Security: admins read their own org; no client writes.
-- ---------------------------------------------------------------------------
--   Admins only, like gig_reports (089): a history row can carry an admin's
--   rescind note or a decline reason, which is not for every org member.
ALTER TABLE staffing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view staffing events" ON staffing_events;
CREATE POLICY "Admins can view staffing events"
  ON staffing_events FOR SELECT
  USING (is_org_admin(organization_id));

-- Belt and braces: with no write policy RLS already refuses client writes, but
-- Supabase grants every privilege on new tables to anon and authenticated by
-- default. Take the write privileges away so a future permissive policy added
-- by mistake still could not open the history to edits.
REVOKE ALL ON staffing_events FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON staffing_events FROM authenticated;
GRANT SELECT ON staffing_events TO authenticated;
GRANT ALL ON staffing_events TO service_role;

-- ---------------------------------------------------------------------------
-- log_staffing_event(): the in-database writer, for future RPCs.
-- ---------------------------------------------------------------------------
--   SECURITY DEFINER so a later DEFINER RPC (or the service role) can record a
--   transition in the same transaction as the change itself. Not callable from
--   a browser: it does not check the caller's organization, so anyone who could
--   call it could write history into any org. search_path is pinned (Supabase
--   linter; same as 080/081/091).
CREATE OR REPLACE FUNCTION log_staffing_event(
  p_organization_id UUID,
  p_actor_type      TEXT,
  p_actor_id        UUID,
  p_entity_type     TEXT,
  p_entity_id       UUID,
  p_action          TEXT,
  p_before          JSONB DEFAULT NULL,
  p_after           JSONB DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO staffing_events
    (organization_id, actor_type, actor_id, entity_type, entity_id, action, before, after)
  VALUES
    (p_organization_id, p_actor_type, p_actor_id, p_entity_type, p_entity_id, p_action, p_before, p_after)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION log_staffing_event(UUID, TEXT, UUID, TEXT, UUID, TEXT, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION log_staffing_event(UUID, TEXT, UUID, TEXT, UUID, TEXT, JSONB, JSONB)
  TO service_role;

-- ===========================================================================
-- verify: table, RLS on, exactly one policy (SELECT), function locked down.
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'staffing_events';   -- t
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'staffing_events';
-- SELECT has_table_privilege('authenticated', 'staffing_events', 'INSERT'); -- f
-- SELECT has_function_privilege('authenticated',
--   'log_staffing_event(uuid, text, uuid, text, uuid, text, jsonb, jsonb)', 'EXECUTE'); -- f
