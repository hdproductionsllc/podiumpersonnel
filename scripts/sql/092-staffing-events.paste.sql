-- ============================================================================
-- PODIUM — STAFFING HISTORY (migration 092, 2026-10-02)
--
-- HOW TO RUN
--   1. Supabase Dashboard -> SQL Editor -> New query
--   2. Paste this ENTIRE file -> Run
--   3. Read the "RESULTS" table printed at the very bottom. Every row should
--      say PASS (one INFO row just reports a number). If one says FAIL, paste
--      the whole output back to Claude.
--
-- Safe to run more than once: the second run changes nothing. It runs inside
-- one transaction, so if any statement errors NOTHING is applied — paste the
-- error back to Claude. It never changes or deletes a row of your data: it adds
-- one new, empty table and one database function, and notes "092 applied" in
-- the migrations log (docs/database-tests.md).
--
-- RUN IT BEFORE the code that writes the history is deployed (David's rule:
-- data before code). The live app today does not know the table exists, so
-- adding it changes nothing you can see. If the new code ever runs without
-- it, the app still works; it just records nothing and logs a warning.
--
-- WHAT IT DOES, in plain English
--
--   Today Podium only remembers where each offer, chair and sub request
--   stands NOW. When something changes, the old state is overwritten and
--   nothing says who changed it. So "why did Mike get this gig, who offered
--   it, and who was asked before him?" cannot be answered — especially for a
--   chair an admin filled directly.
--
--   This adds a "staffing history" table. From the next deploy, every step is
--   written there as it happens: offer sent, opened, accepted, declined,
--   expired, withdrawn; chair assigned or unassigned; sub requested, approved,
--   declined, filled. Each row says WHO (which admin, which musician, or the
--   automatic expiry) and WHEN.
--
--   Who can see it: owners and admins of the organization, their own org only.
--   Who can write it: only the Podium server. Nobody — not even an admin —
--   can edit or delete a history row from the app.
--
-- Body below is supabase/migrations/092_staffing_events.sql, copied verbatim,
-- followed by the migrations-log entry.
-- ============================================================================

BEGIN;

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

-- ---------------------------------------------------------------------------
-- Record that 092 is applied (docs/database-tests.md, "Recording an
-- application"), in the same transaction so it is only recorded if it ran.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('092', '092_staffing_events')
ON CONFLICT (version) DO NOTHING;

COMMIT;


-- ============================================================================
-- RESULTS — read this table. Every row should say PASS.
-- ============================================================================

SELECT
  'the staffing history table exists' AS check_name,
  CASE WHEN to_regclass('public.staffing_events') IS NOT NULL
    THEN 'PASS' ELSE 'FAIL - table missing, tell Claude' END AS result
UNION ALL
SELECT
  'it has every column the app writes',
  CASE WHEN (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staffing_events'
      AND column_name IN ('id', 'organization_id', 'actor_type', 'actor_id', 'entity_type',
                          'entity_id', 'action', 'before', 'after', 'created_at')
  ) = 10 THEN 'PASS' ELSE 'FAIL - a column is missing, tell Claude' END
UNION ALL
SELECT
  'row security is on',
  CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.staffing_events'::regclass)
    THEN 'PASS' ELSE 'FAIL - tell Claude NOW' END
UNION ALL
SELECT
  'org admins can read their own history (one read rule, admins only)',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'staffing_events' AND cmd = 'SELECT'
      AND policyname = 'Admins can view staffing events'
      AND qual LIKE '%is_org_admin%'
  ) THEN 'PASS' ELSE 'FAIL - read rule missing, tell Claude' END
UNION ALL
SELECT
  'no rule lets anyone add, change or delete history from the app',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'staffing_events' AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) THEN 'PASS' ELSE 'FAIL - a write rule exists, tell Claude' END
UNION ALL
SELECT
  'a logged-in user has no write permission on the table',
  CASE WHEN NOT (
       has_table_privilege('authenticated', 'public.staffing_events', 'INSERT')
    OR has_table_privilege('authenticated', 'public.staffing_events', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.staffing_events', 'DELETE')
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'a visitor who is not logged in cannot touch it',
  CASE WHEN NOT (
       has_table_privilege('anon', 'public.staffing_events', 'SELECT')
    OR has_table_privilege('anon', 'public.staffing_events', 'INSERT')
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'the Podium server can write it',
  CASE WHEN has_table_privilege('service_role', 'public.staffing_events', 'INSERT')
    THEN 'PASS' ELSE 'FAIL - the app could not record history, tell Claude' END
UNION ALL
SELECT
  'both lookup indexes exist',
  CASE WHEN (
    SELECT count(*) FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'staffing_events'
      AND indexname IN ('staffing_events_org_created_idx', 'staffing_events_entity_idx')
  ) = 2 THEN 'PASS' ELSE 'FAIL - an index is missing, tell Claude' END
UNION ALL
SELECT
  'the history-writing function exists and pins its search path',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'log_staffing_event' AND p.prosecdef
      AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'only the server can call it (not a browser)',
  CASE WHEN NOT (
       has_function_privilege('anon', 'public.log_staffing_event(uuid, text, uuid, text, uuid, text, jsonb, jsonb)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.log_staffing_event(uuid, text, uuid, text, uuid, text, jsonb, jsonb)', 'EXECUTE')
  ) AND has_function_privilege('service_role', 'public.log_staffing_event(uuid, text, uuid, text, uuid, text, jsonb, jsonb)', 'EXECUTE')
    THEN 'PASS' ELSE 'FAIL - tell Claude' END

UNION ALL
SELECT
  'migration 092 is recorded as applied',
  CASE WHEN EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '092')
    THEN 'PASS' ELSE 'FAIL - tell Claude' END

-- For information only: how many history rows exist. 0 until the new code is
-- deployed; it then grows with every offer, accept, decline and assignment.
UNION ALL
SELECT
  'INFO: staffing history rows so far',
  'INFO - ' || (SELECT count(*) FROM staffing_events)::text;
