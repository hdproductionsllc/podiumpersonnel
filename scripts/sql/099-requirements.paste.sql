-- ============================================================================
-- PODIUM — CREW BY THE DOZEN, AND A CALL PICKER PER CHAIR (migration 099, 2026-10-02)
--
-- HOW TO RUN — AFTER 098, and BEFORE the Release 2 step 3 code is deployed
--   1. Supabase Dashboard -> SQL Editor -> New query
--   2. Paste this ENTIRE file -> Run
--   3. Read the "RESULTS" table printed at the very bottom. Every row should
--      say PASS (rows marked INFO are just counts for you to read). If one
--      says FAIL, paste the whole output back to Claude.
--
-- Needs migrations 092 and 098. If 098 has not been pasted yet this stops
-- with a message and changes nothing. Safe to run more than once: the second
-- run changes nothing. It runs inside one transaction, so if any statement
-- errors NOTHING is applied — paste the error back to Claude. It deletes
-- nothing and changes no existing row.
--
-- WHAT IT DOES, in plain English
--   A production company books crew by the dozen: "8 stagehands for the
--   load-in, $200 each". This lets the admin write that as ONE line (a
--   "requirement") and have Podium make the eight empty slots at once, each
--   limited to the load-in. After that every slot is an ordinary chair:
--   offers, auto-offer, pay and the gig page work exactly as they do now.
--
--   * A list of requirements per gig (role, how many, which calls, the pay
--     for the whole engagement per person, notes). Each one knows whether it
--     is filled yet: that follows its chairs automatically.
--   * Each chair can say which requirement it was made for. Empty for every
--     chair that exists today, and for every chair made any other way.
--   * Two database steps the app calls: "make this requirement and its
--     chairs" (all at once, and a repeated click does not make a second set)
--     and "set which calls this one chair works". Both refuse to do anything
--     for a company whose "chairs can work only some calls" switch is off,
--     which is every company today.
--
--   With the switch off, nothing anyone sees, receives or is paid changes.
--
-- Body below is supabase/migrations/099_requirements.sql, copied verbatim,
-- followed by the migrations-log entry.
-- ============================================================================

BEGIN;

-- 099: requirements ("8 stagehands at load-in"), and setting which calls a chair works
--
-- WHY (the plan, Release 2 A2.3; target architecture 3.5, section 8 rows 15-16)
--   A production crew is booked by the dozen: eight stagehands for the load-in,
--   four for the strike, one A1 for every call. Today that is eight separate
--   "Add Position" clicks and, since 098, eight separate call pickers. A
--   requirement is the one line the admin writes ("Stagehand x 8, Load-in,
--   $200 each"); the database turns it into eight ordinary chairs at once, each
--   limited to the same calls. From then on every chair is a chair: offers,
--   auto-offer, pay, gig page and conflicts treat it exactly like any other
--   (they already ask servicesFor, 098).
--
-- WHAT CHANGES
--   1. requirements: one row per "role x quantity" line of a gig.
--        quantity     how many chairs it asked for (> 0)
--        default_pay  the amount for the WHOLE engagement, per chair (the same
--                     meaning as an offer's custom_pay: owed once, not per
--                     call). Null: no amount suggested. There is deliberately
--                     no pay_basis column (owner decision, 2026-10-02).
--        status       open | filled | cancelled. open/filled are kept in step
--                     with the chairs by a trigger (section 3): filled when as
--                     many of its chairs are confirmed as it asked for. Nothing
--                     sets 'cancelled' yet; a cancelled requirement is left
--                     alone by the trigger.
--        request_key  the id the "Add crew" dialog sends with its request, so a
--                     retry (double click, flaky network) returns the first
--                     requirement instead of making a second set of chairs.
--      Members of the gig's organization read it. Nobody writes it from a
--      browser: create_requirement (below, service role) is the only writer.
--   2. project_positions.requirement_id: the requirement a chair was made for.
--      NULL on every existing chair and on every chair made any other way. A
--      chair can only point at a requirement of its own gig. Deleting a
--      requirement keeps its chairs (they become ordinary chairs).
--   3. A trigger keeps requirements.status in step with its chairs. It only
--      runs for a chair that has a requirement_id (WHEN clause), so for every
--      chair today it never runs at all.
--   4. create_requirement(...): in ONE transaction, checks (admin of the gig's
--      organization, the organization's call_scoped_requirements switch on,
--      gig open, role of the same organization, sane quantity, the calls
--      belong to the gig), writes the requirement, makes `quantity` vacant
--      chairs numbered after the role's existing chairs on the gig, limits each
--      to the chosen calls (098's position_services) and records it in
--      staffing_events. With the same request_key it returns what the first
--      call made and writes nothing.
--   5. set_position_scope(...): the call picker on one chair. Every call, or
--      only the chosen ones. Refused unless the switch is on (for "only
--      these"), and refused while someone holds or is considering the chair:
--      their offer and its email named the calls they said yes to.
--
-- SAFE AGAINST TODAY'S CODE
--   Additive. No existing row changes: requirement_id is NULL everywhere, the
--   status trigger never fires for such a chair, and both functions refuse to
--   do anything for an organization whose switch is off (every organization
--   today). The live app never names the table, the column or the functions.
--   Paste this BEFORE the code that reads it (house rule); the code also copes
--   with it missing.
--
-- Needs 092 (log_staffing_event) and 098 (position_services, scope_mode, the
-- switch). Idempotent and safe to re-run.

-- ---------------------------------------------------------------------------
-- 0. Refuse to run without what this builds on.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.position_services') IS NULL
     OR to_regprocedure('public.services_for_position(uuid)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'organizations'
                       AND column_name = 'call_scoped_requirements') THEN
    RAISE EXCEPTION 'Migration 099 stopped, nothing was changed: migration 098 (which calls a chair works) is missing.';
  END IF;
  IF to_regprocedure('public.log_staffing_event(uuid, text, uuid, text, uuid, text, jsonb, jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Migration 099 stopped, nothing was changed: log_staffing_event (migration 092) is missing.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. requirements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS requirements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  instrument_id uuid NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  quantity      integer NOT NULL CONSTRAINT requirements_quantity_check CHECK (quantity > 0),
  default_pay   numeric(10,2) CONSTRAINT requirements_default_pay_check CHECK (default_pay IS NULL OR default_pay >= 0),
  notes         text,
  status        text NOT NULL DEFAULT 'open'
                CONSTRAINT requirements_status_check CHECK (status IN ('open', 'filled', 'cancelled')),
  request_key   uuid,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_requirements_project ON requirements (project_id);
CREATE UNIQUE INDEX IF NOT EXISTS requirements_request_key_key ON requirements (request_key) WHERE request_key IS NOT NULL;

COMMENT ON TABLE requirements IS
  'One "role x quantity" line of a gig (e.g. Stagehand x 8, load-in only). create_requirement() makes its chairs (project_positions.requirement_id); status follows them. Written only by create_requirement.';
COMMENT ON COLUMN requirements.default_pay IS
  'The amount for the whole engagement, per chair (like contract_offers.custom_pay): owed once, not per call. Null: none suggested.';
COMMENT ON COLUMN requirements.request_key IS
  'The id the requesting dialog sent; a retry with the same id returns this requirement instead of making another.';

DROP TRIGGER IF EXISTS set_updated_at ON requirements;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON requirements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE requirements ENABLE ROW LEVEL SECURITY;

-- Members of the gig's organization read it (as project_positions, 001).
DROP POLICY IF EXISTS "Members can view requirements" ON requirements;
CREATE POLICY "Members can view requirements"
  ON requirements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = requirements.project_id
        AND is_org_member(p.organization_id)
    )
  );

-- No write policy, and the client roles lose the write privileges outright:
-- a requirement and its chairs are made together by create_requirement, so a
-- browser cannot write a requirement that has no chairs, or change a quantity
-- under them.
REVOKE ALL ON requirements FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON requirements FROM authenticated;
GRANT SELECT ON requirements TO authenticated;
GRANT ALL ON requirements TO service_role;

-- ---------------------------------------------------------------------------
-- 2. project_positions.requirement_id
-- ---------------------------------------------------------------------------
ALTER TABLE project_positions
  ADD COLUMN IF NOT EXISTS requirement_id uuid REFERENCES requirements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_positions_requirement
  ON project_positions (requirement_id) WHERE requirement_id IS NOT NULL;

COMMENT ON COLUMN project_positions.requirement_id IS
  'The requirement this chair was made for (099). NULL for every chair made any other way.';

-- A chair can only belong to a requirement of its own gig, whichever of the
-- two is written. Checked with the definer's rights so the answer does not
-- depend on what the writer can see.
CREATE OR REPLACE FUNCTION requirement_same_project()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.requirement_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM requirements WHERE id = NEW.requirement_id AND project_id = NEW.project_id) THEN
    RAISE EXCEPTION 'requirement_wrong_project'
      USING ERRCODE = 'P0001',
            DETAIL = 'A chair can only belong to a requirement of its own gig.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION requirement_same_project() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_requirement_same_project ON project_positions;
CREATE TRIGGER trg_requirement_same_project
  BEFORE INSERT OR UPDATE OF requirement_id, project_id ON project_positions
  FOR EACH ROW EXECUTE FUNCTION requirement_same_project();

-- ---------------------------------------------------------------------------
-- 3. requirements.status follows its chairs
-- ---------------------------------------------------------------------------
--   filled: at least `quantity` of its chairs are confirmed. open: fewer.
--   cancelled is never touched. Runs only for a chair with a requirement_id
--   (the WHEN clauses), i.e. never for any chair that exists today.
CREATE OR REPLACE FUNCTION requirement_status_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old UUID;
  v_new UUID;
  v_id  UUID;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN v_old := OLD.requirement_id; END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN v_new := NEW.requirement_id; END IF;
  FOR v_id IN
    SELECT DISTINCT x FROM unnest(ARRAY[v_old, v_new]) AS x WHERE x IS NOT NULL
  LOOP
    UPDATE requirements r
       SET status = s.next
      FROM (
        SELECT CASE WHEN count(*) FILTER (WHERE pp.status = 'confirmed') >= rq.quantity
                    THEN 'filled' ELSE 'open' END AS next
          FROM requirements rq
          LEFT JOIN project_positions pp ON pp.requirement_id = rq.id
         WHERE rq.id = v_id
         GROUP BY rq.quantity
      ) s
     WHERE r.id = v_id
       AND r.status <> 'cancelled'
       AND r.status IS DISTINCT FROM s.next;
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION requirement_status_sync() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_requirement_status_insert ON project_positions;
CREATE TRIGGER trg_requirement_status_insert
  AFTER INSERT ON project_positions
  FOR EACH ROW WHEN (NEW.requirement_id IS NOT NULL)
  EXECUTE FUNCTION requirement_status_sync();

DROP TRIGGER IF EXISTS trg_requirement_status_update ON project_positions;
CREATE TRIGGER trg_requirement_status_update
  AFTER UPDATE OF status, requirement_id ON project_positions
  FOR EACH ROW WHEN (NEW.requirement_id IS NOT NULL OR OLD.requirement_id IS NOT NULL)
  EXECUTE FUNCTION requirement_status_sync();

DROP TRIGGER IF EXISTS trg_requirement_status_delete ON project_positions;
CREATE TRIGGER trg_requirement_status_delete
  AFTER DELETE ON project_positions
  FOR EACH ROW WHEN (OLD.requirement_id IS NOT NULL)
  EXECUTE FUNCTION requirement_status_sync();

-- ---------------------------------------------------------------------------
-- 4. create_requirement: the requirement and its chairs, in one transaction
-- ---------------------------------------------------------------------------
--   p_service_ids  NULL: every chair works every call of the gig ('all').
--                  An array: every chair works exactly those calls
--                  ('selected'); it must not be empty, and every id must be a
--                  call of this gig.
--   p_request_key  the caller's id for this request. The same key again
--                  returns { result: 'existing', ... } for what the first call
--                  made, and writes nothing. A key already used on another gig
--                  is refused ('request_key_reused').
--
--   Returns jsonb. On success:
--     { "result": "created" | "existing",
--       "requirement": { id, project_id, instrument_id, quantity, default_pay, notes, status },
--       "position_ids": [ ...in chair order... ] }
--   Otherwise { "result": <reason> } and nothing changed, reason one of:
--     not_found (with "what": project | instrument), forbidden (p_created_by
--     is not an owner/admin of the gig's organization), not_enabled (the
--     organization's call_scoped_requirements is off), gig_closed,
--     invalid_quantity (not 1..100), invalid_pay (negative), no_services (an
--     empty list of calls), wrong_service (a call of another gig),
--     request_key_reused.
--
--   Two requirements for one gig queue on an advisory lock, so their chair
--   numbers never collide. Chairs are numbered after the highest existing
--   chair of the same role on the gig (Stagehand 1-8 for the load-in, then
--   9-12 for the strike).
CREATE OR REPLACE FUNCTION create_requirement(
  p_project_id    UUID,
  p_instrument_id UUID,
  p_quantity      INTEGER,
  p_created_by    UUID,
  p_service_ids   UUID[] DEFAULT NULL,
  p_default_pay   NUMERIC DEFAULT NULL,
  p_notes         TEXT DEFAULT NULL,
  p_request_key   UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org         UUID;
  v_status      TEXT;
  v_role        TEXT;
  v_on          BOOLEAN;
  v_existing    requirements%ROWTYPE;
  v_req         requirements%ROWTYPE;
  v_services    UUID[];
  v_base        INTEGER;
  v_positions   UUID[];
  v_notes       TEXT := NULLIF(left(btrim(COALESCE(p_notes, '')), 1000), '');
BEGIN
  SELECT organization_id, status INTO v_org, v_status FROM projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'not_found', 'what', 'project');
  END IF;

  SELECT role INTO v_role FROM organization_members
   WHERE user_id = p_created_by AND organization_id = v_org;
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('result', 'forbidden');
  END IF;

  SELECT call_scoped_requirements INTO v_on FROM organizations WHERE id = v_org;
  IF v_on IS NOT TRUE THEN
    RETURN jsonb_build_object('result', 'not_enabled');
  END IF;

  -- One requirement at a time per gig: the chair numbers below read then write.
  PERFORM pg_advisory_xact_lock(hashtextextended('create_requirement:' || p_project_id, 0));

  -- A retry of a request that already went through.
  IF p_request_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM requirements WHERE request_key = p_request_key;
    IF FOUND THEN
      IF v_existing.project_id IS DISTINCT FROM p_project_id THEN
        RETURN jsonb_build_object('result', 'request_key_reused');
      END IF;
      RETURN jsonb_build_object(
        'result', 'existing',
        'requirement', jsonb_build_object('id', v_existing.id, 'project_id', v_existing.project_id,
                                          'instrument_id', v_existing.instrument_id, 'quantity', v_existing.quantity,
                                          'default_pay', v_existing.default_pay, 'notes', v_existing.notes,
                                          'status', v_existing.status),
        'position_ids', COALESCE((SELECT jsonb_agg(id ORDER BY chair_number, id) FROM project_positions
                                   WHERE requirement_id = v_existing.id), '[]'::jsonb));
    END IF;
  END IF;

  IF v_status IN ('cancelled', 'completed') THEN
    RETURN jsonb_build_object('result', 'gig_closed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM instruments WHERE id = p_instrument_id AND organization_id = v_org) THEN
    RETURN jsonb_build_object('result', 'not_found', 'what', 'instrument');
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 100 THEN
    RETURN jsonb_build_object('result', 'invalid_quantity');
  END IF;

  IF p_default_pay IS NOT NULL AND p_default_pay < 0 THEN
    RETURN jsonb_build_object('result', 'invalid_pay');
  END IF;

  IF p_service_ids IS NOT NULL THEN
    SELECT COALESCE(array_agg(DISTINCT x), '{}') INTO v_services FROM unnest(p_service_ids) AS x WHERE x IS NOT NULL;
    IF cardinality(v_services) = 0 THEN
      RETURN jsonb_build_object('result', 'no_services');
    END IF;
    IF (SELECT count(*) FROM services WHERE project_id = p_project_id AND id = ANY (v_services)) <> cardinality(v_services) THEN
      RETURN jsonb_build_object('result', 'wrong_service');
    END IF;
  END IF;

  INSERT INTO requirements (project_id, instrument_id, quantity, default_pay, notes, request_key, created_by)
  VALUES (p_project_id, p_instrument_id, p_quantity, p_default_pay, v_notes, p_request_key, p_created_by)
  RETURNING * INTO v_req;

  SELECT COALESCE(max(chair_number), 0) INTO v_base
    FROM project_positions WHERE project_id = p_project_id AND instrument_id = p_instrument_id;

  WITH made AS (
    INSERT INTO project_positions (project_id, instrument_id, chair_number, status, requirement_id, scope_mode)
    SELECT p_project_id, p_instrument_id, v_base + n, 'vacant', v_req.id,
           CASE WHEN v_services IS NULL THEN 'all' ELSE 'selected' END
      FROM generate_series(1, p_quantity) AS n
    RETURNING id, chair_number
  )
  SELECT array_agg(id ORDER BY chair_number) INTO v_positions FROM made;

  IF v_services IS NOT NULL THEN
    INSERT INTO position_services (project_position_id, service_id)
    SELECT pos, svc FROM unnest(v_positions) AS pos CROSS JOIN unnest(v_services) AS svc;
  END IF;

  PERFORM log_staffing_event(v_org, 'admin', p_created_by, 'requirement', v_req.id, 'requirement.created',
    NULL,
    jsonb_strip_nulls(jsonb_build_object(
      'project_id', p_project_id, 'instrument_id', p_instrument_id, 'quantity', p_quantity,
      'default_pay', p_default_pay, 'service_ids', to_jsonb(v_services),
      'position_ids', to_jsonb(v_positions))));

  RETURN jsonb_build_object(
    'result', 'created',
    'requirement', jsonb_build_object('id', v_req.id, 'project_id', v_req.project_id,
                                      'instrument_id', v_req.instrument_id, 'quantity', v_req.quantity,
                                      'default_pay', v_req.default_pay, 'notes', v_req.notes,
                                      'status', v_req.status),
    'position_ids', to_jsonb(v_positions));
END;
$$;

REVOKE ALL ON FUNCTION create_requirement(UUID, UUID, INTEGER, UUID, UUID[], NUMERIC, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_requirement(UUID, UUID, INTEGER, UUID, UUID[], NUMERIC, TEXT, UUID)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 5. set_position_scope: the call picker on one chair
-- ---------------------------------------------------------------------------
--   p_service_ids  NULL: the chair works every call of its gig ('all').
--                  An array: exactly those calls ('selected'); not empty, all
--                  of this gig.
--
--   Returns jsonb { "result": "updated" | "unchanged" } or a refusal (nothing
--   changed): not_found, forbidden, not_enabled (switch off, for a list of
--   calls), chair_in_use (someone is seated, or holds an offer that is open
--   or accepted: that offer and its email named the calls they were asked
--   for), no_services, wrong_service.
--   Setting a chair back to every call is allowed whatever the switch says.
CREATE OR REPLACE FUNCTION set_position_scope(
  p_position_id UUID,
  p_updated_by  UUID,
  p_service_ids UUID[] DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pos      project_positions%ROWTYPE;
  v_org      UUID;
  v_role     TEXT;
  v_on       BOOLEAN;
  v_services UUID[];
  v_before   UUID[];
  v_mode     TEXT;
BEGIN
  SELECT * INTO v_pos FROM project_positions WHERE id = p_position_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;

  SELECT p.organization_id, o.call_scoped_requirements INTO v_org, v_on
    FROM projects p JOIN organizations o ON o.id = p.organization_id
   WHERE p.id = v_pos.project_id;

  SELECT role INTO v_role FROM organization_members
   WHERE user_id = p_updated_by AND organization_id = v_org;
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('result', 'forbidden');
  END IF;

  IF p_service_ids IS NOT NULL THEN
    IF v_on IS NOT TRUE THEN
      RETURN jsonb_build_object('result', 'not_enabled');
    END IF;
    SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), '{}') INTO v_services FROM unnest(p_service_ids) AS x WHERE x IS NOT NULL;
    IF cardinality(v_services) = 0 THEN
      RETURN jsonb_build_object('result', 'no_services');
    END IF;
    IF (SELECT count(*) FROM services WHERE project_id = v_pos.project_id AND id = ANY (v_services)) <> cardinality(v_services) THEN
      RETURN jsonb_build_object('result', 'wrong_service');
    END IF;
  END IF;

  v_mode := CASE WHEN v_services IS NULL THEN 'all' ELSE 'selected' END;
  SELECT COALESCE(array_agg(service_id ORDER BY service_id), '{}') INTO v_before
    FROM position_services WHERE project_position_id = v_pos.id;

  IF v_pos.scope_mode = v_mode AND (v_mode = 'all' OR v_before = v_services) THEN
    RETURN jsonb_build_object('result', 'unchanged');
  END IF;

  IF v_pos.musician_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM contract_offers
     WHERE project_position_id = v_pos.id AND status IN ('pending', 'viewed', 'accepted')
  ) THEN
    RETURN jsonb_build_object('result', 'chair_in_use');
  END IF;

  DELETE FROM position_services WHERE project_position_id = v_pos.id;
  UPDATE project_positions SET scope_mode = v_mode WHERE id = v_pos.id AND scope_mode IS DISTINCT FROM v_mode;
  IF v_services IS NOT NULL THEN
    INSERT INTO position_services (project_position_id, service_id)
    SELECT v_pos.id, svc FROM unnest(v_services) AS svc;
  END IF;

  PERFORM log_staffing_event(v_org, 'admin', p_updated_by, 'position', v_pos.id, 'position.scope_changed',
    jsonb_build_object('scope_mode', v_pos.scope_mode,
                       'service_ids', CASE WHEN v_pos.scope_mode = 'selected' THEN to_jsonb(v_before) END),
    jsonb_build_object('scope_mode', v_mode, 'service_ids', to_jsonb(v_services)));

  RETURN jsonb_build_object('result', 'updated');
END;
$$;

REVOKE ALL ON FUNCTION set_position_scope(UUID, UUID, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION set_position_scope(UUID, UUID, UUID[]) TO service_role;

-- ===========================================================================
-- verify:
-- SELECT count(*) FROM requirements;                                          -- 0
-- SELECT count(*) FROM project_positions WHERE requirement_id IS NOT NULL;    -- 0

-- ---------------------------------------------------------------------------
-- Record that 099 is applied (docs/database-tests.md, "Recording an
-- application"), in the same transaction so it is only recorded if it ran.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('099', '099_requirements')
ON CONFLICT (version) DO NOTHING;

COMMIT;


-- ============================================================================
-- RESULTS — read this table. Every row should say PASS (INFO rows are counts).
-- ============================================================================

SELECT
  'the requirements list exists, with row security on' AS check_name,
  CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.requirements')) IS TRUE
    THEN 'PASS' ELSE 'FAIL - tell Claude' END AS result
UNION ALL
SELECT
  'members can read it (1 rule), nobody can write it from a browser',
  CASE WHEN (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'requirements') = 1
        AND NOT has_table_privilege('authenticated', 'public.requirements', 'INSERT')
        AND NOT has_table_privilege('authenticated', 'public.requirements', 'UPDATE')
        AND NOT has_table_privilege('authenticated', 'public.requirements', 'DELETE')
        AND NOT has_table_privilege('anon', 'public.requirements', 'SELECT')
    THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'how many, pay and status only accept sensible values (3 rules)',
  CASE WHEN (
    SELECT count(*) FROM pg_constraint
    WHERE conrelid = 'public.requirements'::regclass
      AND conname IN ('requirements_quantity_check', 'requirements_default_pay_check', 'requirements_status_check')
  ) = 3 THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'a repeated click cannot make a second requirement',
  CASE WHEN to_regclass('public.requirements_request_key_key') IS NOT NULL
    THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'chairs can name their requirement',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_positions' AND column_name = 'requirement_id'
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'the four guards are in place (same gig; filled/open kept up to date x 3)',
  CASE WHEN (
    SELECT count(*) FROM pg_trigger
    WHERE tgrelid = 'public.project_positions'::regclass
      AND tgname IN ('trg_requirement_same_project', 'trg_requirement_status_insert',
                     'trg_requirement_status_update', 'trg_requirement_status_delete')
      AND NOT tgisinternal
  ) = 4 THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'the two new database steps exist',
  CASE WHEN to_regprocedure('public.create_requirement(uuid, uuid, integer, uuid, uuid[], numeric, text, uuid)') IS NOT NULL
        AND to_regprocedure('public.set_position_scope(uuid, uuid, uuid[])') IS NOT NULL
    THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'browsers cannot call them (only the Podium server can)',
  CASE WHEN NOT has_function_privilege('authenticated', 'public.create_requirement(uuid, uuid, integer, uuid, uuid[], numeric, text, uuid)', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.create_requirement(uuid, uuid, integer, uuid, uuid[], numeric, text, uuid)', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public.set_position_scope(uuid, uuid, uuid[])', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.set_position_scope(uuid, uuid, uuid[])', 'EXECUTE')
    THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'companies with the switch off have no requirements and no chairs made by one',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM requirements r JOIN projects p ON p.id = r.project_id
      JOIN organizations o ON o.id = p.organization_id
     WHERE NOT o.call_scoped_requirements
  ) AND NOT EXISTS (
    SELECT 1 FROM project_positions pp JOIN projects p ON p.id = pp.project_id
      JOIN organizations o ON o.id = p.organization_id
     WHERE pp.requirement_id IS NOT NULL AND NOT o.call_scoped_requirements
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'migration 099 is recorded as applied',
  CASE WHEN EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '099')
    THEN 'PASS' ELSE 'FAIL - tell Claude' END

-- For information only.
UNION ALL
SELECT
  'INFO: companies with the switch on (expect 0)',
  'INFO - ' || (SELECT count(*) FROM organizations WHERE call_scoped_requirements)::text
UNION ALL
SELECT
  'INFO: requirements (expect 0)',
  'INFO - ' || (SELECT count(*) FROM requirements)::text;
