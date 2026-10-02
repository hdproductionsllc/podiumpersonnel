-- ============================================================================
-- PODIUM — WHICH CALLS A CHAIR WORKS (migration 098, 2026-10-02)
--
-- HOW TO RUN — BEFORE the Release 2 step 2 code is deployed
--   1. Supabase Dashboard -> SQL Editor -> New query
--   2. Paste this ENTIRE file -> Run
--   3. Read the "RESULTS" table printed at the very bottom. Every row should
--      say PASS (rows marked INFO are just counts for you to read). If one
--      says FAIL, paste the whole output back to Claude.
--
-- Needs migrations 081 and 096 (already live). Safe to run more than once:
-- the second run changes nothing. It runs inside one transaction, so if any
-- statement errors NOTHING is applied — paste the error back to Claude. It
-- deletes nothing and changes no existing row's content.
--
-- WHAT IT DOES, in plain English
--   Today every chair on a gig works every service of the gig. A production
--   crew is not like that: the sound engineer works the rehearsal and the
--   show, the eight stagehands only the load-in. This adds what the database
--   needs to say that, and nothing turns it on:
--
--   * A switch per organization, "chairs can work only some services". OFF
--     for every organization. Only Podium can change it (like billing).
--   * A setting per chair: "every service" (what every chair is now, and
--     stays) or "only these services".
--   * The list of services for an "only these" chair. If the list is empty
--     the chair works nothing; it never quietly goes back to the whole gig.
--   * Rules that keep it honest: a chair can only list services of its own
--     gig; only an organization with the switch on can have an "only these"
--     chair (and such a chair or its services cannot be moved to another
--     gig); the switch cannot be turned off under such a chair.
--   * The two automatic database steps that look at a gig's services (the
--     auto-offer's "is this person booked elsewhere at the same time" and
--     "I can't make it"'s "has the gig started") now look at the chair's
--     services. For a chair on every service, that is the same answer.
--
--   With the switch off, which is every company today, nothing anyone sees,
--   receives or is paid changes.
--
-- Body below is supabase/migrations/098_position_services.sql, copied
-- verbatim, followed by the migrations-log entry.
-- ============================================================================

BEGIN;

-- 098: which calls a chair works (position_services), and the switch that allows it
--
-- WHY (the plan, Release 2 A2.2; target architecture 3.4, section 8 row 14)
--   Today every chair on a gig works every service of the gig: the quartet that
--   plays the rehearsal also plays the ceremony. A production crew is not like
--   that: the A1 works rehearsal and show, eight hands work load-in only. This
--   is the one real change to the data model: a chair can name the services it
--   works. Everything that reads "the gig's services" for a person (their pay,
--   their offer email, their gig page, their calendar, conflicts, reminders)
--   then asks one question instead: which services does THIS chair work?
--   (src/lib/staffing/scope.ts, servicesFor; in SQL, services_for_position.)
--
-- WHAT CHANGES
--   1. organizations.call_scoped_requirements boolean NOT NULL DEFAULT false.
--      OFF for every organization. Nothing here turns it on (production crew
--      organizations get it by default in a later step). Only Podium (the
--      service role) can change it: it joins the frozen columns of 081.
--   2. project_positions.scope_mode text NOT NULL DEFAULT 'all',
--      CHECK in ('all', 'selected').
--        'all'       the chair works every service of its gig. Every existing
--                    chair, and every new one unless someone chooses otherwise.
--                    This is today's behaviour, exactly.
--        'selected'  the chair works only the services listed for it in
--                    position_services. NO rows means NO services: a chair
--                    whose last scoped service was deleted works nothing; it
--                    never silently goes back to working the whole gig.
--   3. position_services (project_position_id, service_id), primary key on
--      both, each deleted with its chair or its service. Read by members of the
--      gig's organization, written by its admins (the same rule as
--      project_positions). A chair and a service from different gigs cannot be
--      paired (trigger trg_position_services_same_project), and a chair or a
--      service that has such a pairing cannot be moved to another gig
--      (trg_position_services_project_move, on both tables).
--   4. A chair can be set to 'selected' only in an organization whose
--      call_scoped_requirements is on (trigger trg_scope_needs_switch), and the
--      switch cannot be turned off while any of its chairs is 'selected'
--      (trigger trg_scope_switch_off_guard). So for every organization with the
--      switch off (all of them, today) every chair is 'all', and nothing they
--      see can change.
--   5. services_for_position(position_id): the chair's services, in SQL.
--   6. cascade_offer (096) checks "booked at the same time" against the chair's
--      services on both sides, and worker_drop (096) asks whether the CHAIR's
--      first service has started. For a chair in 'all' mode these are exactly
--      the gig's services, so both functions answer as before.
--
-- SAFE AGAINST TODAY'S CODE
--   No backfill and nothing rewritten: every chair gets 'all', which is what
--   it already meant. The live app never names the new columns or the table.
--   cascade_offer only runs for an organization with auto-offer on (none), and
--   worker_drop only where allow_worker_drop is on; with every chair 'all'
--   both give the same answers as before. Paste this BEFORE the code that reads
--   it (house rule: migration first); the code also copes with it missing.
--
-- Idempotent and safe to re-run.

-- ---------------------------------------------------------------------------
-- 0. Refuse to run without what this builds on.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.cascade_offer(uuid, uuid, timestamp with time zone, numeric, jsonb, text)') IS NULL
     OR to_regprocedure('public.worker_drop(uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'Migration 098 stopped, nothing was changed: cascade_offer / worker_drop (migration 096) are missing.';
  END IF;
  IF to_regprocedure('public.protect_privileged_org_columns()') IS NULL THEN
    RAISE EXCEPTION 'Migration 098 stopped, nothing was changed: protect_privileged_org_columns (migration 081) is missing.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. The organization's switch: off for everyone
-- ---------------------------------------------------------------------------
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS call_scoped_requirements boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN organizations.call_scoped_requirements IS
  'When true, a chair can be limited to some of its gig''s services (project_positions.scope_mode, position_services). Off by default; set by Podium only.';

-- 081's frozen columns, plus call_scoped_requirements. The function is 081's,
-- unchanged apart from the one added line (SECURITY INVOKER is required: see 081).
CREATE OR REPLACE FUNCTION protect_privileged_org_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  changed TEXT[] := '{}';
BEGIN
  -- The service role (billing webhook, provisioning, migrations) is exactly who
  -- SHOULD be setting these. Everything else — anon, authenticated — is not.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.is_comped              IS DISTINCT FROM OLD.is_comped              THEN changed := array_append(changed, 'is_comped'); END IF;
  IF NEW.plan_tier              IS DISTINCT FROM OLD.plan_tier              THEN changed := array_append(changed, 'plan_tier'); END IF;
  IF NEW.subscription_status    IS DISTINCT FROM OLD.subscription_status    THEN changed := array_append(changed, 'subscription_status'); END IF;
  IF NEW.trial_ends_at          IS DISTINCT FROM OLD.trial_ends_at          THEN changed := array_append(changed, 'trial_ends_at'); END IF;
  IF NEW.stripe_customer_id     IS DISTINCT FROM OLD.stripe_customer_id     THEN changed := array_append(changed, 'stripe_customer_id'); END IF;
  IF NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id THEN changed := array_append(changed, 'stripe_subscription_id'); END IF;
  IF NEW.library_org_id         IS DISTINCT FROM OLD.library_org_id         THEN changed := array_append(changed, 'library_org_id'); END IF;
  IF NEW.intake_enabled         IS DISTINCT FROM OLD.intake_enabled         THEN changed := array_append(changed, 'intake_enabled'); END IF;
  IF NEW.call_scoped_requirements IS DISTINCT FROM OLD.call_scoped_requirements THEN changed := array_append(changed, 'call_scoped_requirements'); END IF;

  IF array_length(changed, 1) > 0 THEN
    RAISE EXCEPTION
      'These fields are managed by Podium and cannot be changed directly: %',
      array_to_string(changed, ', ')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. The chair's mode: every service (today) or only the listed ones
-- ---------------------------------------------------------------------------
ALTER TABLE project_positions
  ADD COLUMN IF NOT EXISTS scope_mode text NOT NULL DEFAULT 'all';

ALTER TABLE project_positions DROP CONSTRAINT IF EXISTS project_positions_scope_mode_check;
ALTER TABLE project_positions
  ADD CONSTRAINT project_positions_scope_mode_check CHECK (scope_mode IN ('all', 'selected'));

COMMENT ON COLUMN project_positions.scope_mode IS
  'all: the chair works every service of its gig (the default, and every chair before 098). selected: only the services in position_services; none listed means none.';

-- ---------------------------------------------------------------------------
-- 3. Which services a 'selected' chair works
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS position_services (
  project_position_id uuid NOT NULL REFERENCES project_positions(id) ON DELETE CASCADE,
  service_id          uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_position_id, service_id)
);

-- The primary key covers lookups by chair; this one covers "which chairs work
-- this service" and the delete cascade from services.
CREATE INDEX IF NOT EXISTS idx_position_services_service ON position_services (service_id);

COMMENT ON TABLE position_services IS
  'The services a chair works when its scope_mode is ''selected''. Ignored for a chair in ''all'' mode. Read through servicesFor (src/lib/staffing/scope.ts) or services_for_position().';

ALTER TABLE position_services ENABLE ROW LEVEL SECURITY;

-- The same rule as project_positions (001): members of the gig's organization
-- read, its admins write.
DROP POLICY IF EXISTS "Members can view position services" ON position_services;
CREATE POLICY "Members can view position services"
  ON position_services FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_positions pp
      JOIN projects p ON p.id = pp.project_id
      WHERE pp.id = position_services.project_position_id
        AND is_org_member(p.organization_id)
    )
  );

DROP POLICY IF EXISTS "Admins can manage position services" ON position_services;
CREATE POLICY "Admins can manage position services"
  ON position_services FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM project_positions pp
      JOIN projects p ON p.id = pp.project_id
      WHERE pp.id = position_services.project_position_id
        AND is_org_admin(p.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_positions pp
      JOIN projects p ON p.id = pp.project_id
      WHERE pp.id = position_services.project_position_id
        AND is_org_admin(p.organization_id)
    )
  );

-- A chair and a service must belong to the same gig. Checked with the
-- definer's rights so the answer does not depend on what the writer can see;
-- the writer learns nothing but "refused".
CREATE OR REPLACE FUNCTION position_services_same_project()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_position_project UUID;
  v_service_project  UUID;
BEGIN
  SELECT project_id INTO v_position_project FROM project_positions WHERE id = NEW.project_position_id;
  SELECT project_id INTO v_service_project FROM services WHERE id = NEW.service_id;
  IF v_position_project IS NULL OR v_service_project IS DISTINCT FROM v_position_project THEN
    RAISE EXCEPTION 'position_service_wrong_project'
      USING ERRCODE = 'P0001',
            DETAIL = 'A chair can only be scoped to services of its own gig.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION position_services_same_project() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_position_services_same_project ON position_services;
CREATE TRIGGER trg_position_services_same_project
  BEFORE INSERT OR UPDATE ON position_services
  FOR EACH ROW EXECUTE FUNCTION position_services_same_project();

-- The same rule from the other side: moving a chair or a service to another
-- gig would leave its pairings joining two gigs. No flow moves either today;
-- if one ever does, it must clear the chair's scope first. A move with no
-- pairings (every chair today) is untouched.
CREATE OR REPLACE FUNCTION position_services_project_move_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.project_id IS NOT DISTINCT FROM OLD.project_id THEN RETURN NEW; END IF;
  IF (TG_TABLE_NAME = 'project_positions'
        AND EXISTS (SELECT 1 FROM position_services WHERE project_position_id = OLD.id))
     OR (TG_TABLE_NAME = 'services'
        AND EXISTS (SELECT 1 FROM position_services WHERE service_id = OLD.id)) THEN
    RAISE EXCEPTION 'position_service_wrong_project'
      USING ERRCODE = 'P0001',
            DETAIL = 'This chair or service is scoped to calls of its gig; clear that scope before moving it to another gig.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION position_services_project_move_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_position_services_project_move ON project_positions;
CREATE TRIGGER trg_position_services_project_move
  BEFORE UPDATE OF project_id ON project_positions
  FOR EACH ROW EXECUTE FUNCTION position_services_project_move_guard();

DROP TRIGGER IF EXISTS trg_position_services_project_move ON services;
CREATE TRIGGER trg_position_services_project_move
  BEFORE UPDATE OF project_id ON services
  FOR EACH ROW EXECUTE FUNCTION position_services_project_move_guard();

-- ---------------------------------------------------------------------------
-- 4. 'selected' only where the organization's switch is on
-- ---------------------------------------------------------------------------
--   A chair becomes 'selected' only in an organization with
--   call_scoped_requirements on. Applies to every role, the service role too:
--   it is what makes "the switch is off, so every chair works the whole gig"
--   a fact the readers can rely on rather than a habit of the UI.
CREATE OR REPLACE FUNCTION scope_needs_switch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_on BOOLEAN;
BEGIN
  IF NEW.scope_mode IS DISTINCT FROM 'selected' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.scope_mode = 'selected' AND OLD.project_id = NEW.project_id THEN RETURN NEW; END IF;

  SELECT o.call_scoped_requirements INTO v_on
    FROM projects p JOIN organizations o ON o.id = p.organization_id
   WHERE p.id = NEW.project_id;
  IF v_on IS NOT TRUE THEN
    RAISE EXCEPTION 'call_scoped_requirements_off'
      USING ERRCODE = 'P0001',
            DETAIL = 'This organization works every chair on every service; a chair cannot be limited to some services.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION scope_needs_switch() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_scope_needs_switch ON project_positions;
CREATE TRIGGER trg_scope_needs_switch
  BEFORE INSERT OR UPDATE OF scope_mode, project_id ON project_positions
  FOR EACH ROW EXECUTE FUNCTION scope_needs_switch();

--   And the switch cannot be turned off under a chair that is 'selected':
--   turning it off would otherwise leave scoped chairs in an organization
--   that, by the rule above, has none. Set those chairs back to 'all' first.
CREATE OR REPLACE FUNCTION scope_switch_off_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NEW.call_scoped_requirements IS TRUE OR OLD.call_scoped_requirements IS NOT TRUE THEN RETURN NEW; END IF;

  SELECT count(*) INTO v_count
    FROM project_positions pp JOIN projects p ON p.id = pp.project_id
   WHERE p.organization_id = NEW.id AND pp.scope_mode = 'selected';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'call_scoped_requirements_in_use'
      USING ERRCODE = 'P0001',
            DETAIL = format('%s chair(s) of this organization work only some services; set them back to every service first.', v_count);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION scope_switch_off_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_scope_switch_off_guard ON organizations;
CREATE TRIGGER trg_scope_switch_off_guard
  BEFORE UPDATE OF call_scoped_requirements ON organizations
  FOR EACH ROW EXECUTE FUNCTION scope_switch_off_guard();

-- ---------------------------------------------------------------------------
-- 5. services_for_position: the chair's services, in SQL
-- ---------------------------------------------------------------------------
--   The SQL twin of servicesFor (src/lib/staffing/scope.ts): every service of
--   the chair's gig when scope_mode is 'all', only the listed ones when it is
--   'selected' (none listed: none). Runs with the caller's rights, so it shows
--   nobody anything they could not already read; the DEFINER functions below
--   call it as their owner.
CREATE OR REPLACE FUNCTION services_for_position(p_position_id UUID)
RETURNS SETOF services
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT s.*
    FROM project_positions pp
    JOIN services s ON s.project_id = pp.project_id
   WHERE pp.id = p_position_id
     AND (pp.scope_mode IS DISTINCT FROM 'selected'
          OR EXISTS (SELECT 1 FROM position_services ps
                      WHERE ps.project_position_id = pp.id AND ps.service_id = s.id))
$$;

REVOKE ALL ON FUNCTION services_for_position(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION services_for_position(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 6a. cascade_offer: "booked at the same time" compares the chairs' services
-- ---------------------------------------------------------------------------
--   096's function, unchanged except for the two lines that read the services
--   of each chair (services_for_position instead of every service of each gig)
--   and their comment. Same signature, so its grants stand; repeated anyway.
CREATE OR REPLACE FUNCTION cascade_offer(
  p_trigger_offer_id UUID,
  p_musician_id      UUID,
  p_expires_at       TIMESTAMPTZ,
  p_custom_pay       NUMERIC DEFAULT NULL,
  p_terms_snapshot   JSONB DEFAULT NULL,
  p_delivery_status  TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pos_id    UUID;
  v_pos       project_positions%ROWTYPE;
  v_org       UUID;
  v_refusal   TEXT;
  v_m_org     UUID;
  v_m_active  BOOLEAN;
  v_offer     RECORD;
  v_now       TIMESTAMPTZ := now();
BEGIN
  SELECT project_position_id INTO v_pos_id FROM contract_offers WHERE id = p_trigger_offer_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;
  SELECT * INTO v_pos FROM project_positions WHERE id = v_pos_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;

  v_refusal := cascade_refusal(p_trigger_offer_id);
  IF v_refusal IS NOT NULL THEN
    RETURN jsonb_build_object('result', v_refusal);
  END IF;

  IF p_expires_at IS NULL OR p_expires_at <= v_now THEN
    RETURN jsonb_build_object('result', 'no_time_left');
  END IF;

  SELECT organization_id INTO v_org FROM projects WHERE id = v_pos.project_id;

  SELECT organization_id, is_active INTO v_m_org, v_m_active FROM musicians WHERE id = p_musician_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'musician_not_found');
  END IF;
  IF v_m_org IS DISTINCT FROM v_org THEN
    RETURN jsonb_build_object('result', 'wrong_organization');
  END IF;
  IF v_m_active IS FALSE THEN
    RETURN jsonb_build_object('result', 'musician_inactive');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('create_offer:' || v_pos.project_id || ':' || p_musician_id, 0));
  IF EXISTS (
    SELECT 1 FROM contract_offers o
    JOIN project_positions pp ON pp.id = o.project_position_id
    WHERE pp.project_id = v_pos.project_id
      AND o.musician_id = p_musician_id
      AND o.status IN ('pending', 'viewed', 'accepted')
  ) THEN
    RETURN jsonb_build_object('result', 'musician_has_active_offer');
  END IF;

  -- Their turn at this chair is over: they declined it, let it lapse, had it
  -- withdrawn or replaced, or dropped it. The caller's candidate list leaves
  -- them out already; this holds even if that list was read wrong.
  IF EXISTS (
    SELECT 1 FROM contract_offers
    WHERE project_position_id = v_pos.id
      AND musician_id = p_musician_id
      AND status IN ('declined', 'expired', 'superseded', 'rescinded', 'released')
  ) THEN
    RETURN jsonb_build_object('result', 'musician_had_turn');
  END IF;

  -- Booked on another gig at the same time: an accepted offer, or one still
  -- waiting inside its deadline, whose chair's services overlap this chair's
  -- (services_for_position, 098: every service of the gig unless the chair is
  -- scoped to some; a service with no usable end time counts as 3 hours, as
  -- src/lib/staffing/conflicts.ts does). The caller checked this too, but two
  -- automatic offers on different gigs could each have read "free"; they queue
  -- on this lock, taken last so it cannot deadlock with the locks above, and
  -- the second sees the first.
  -- Outside commitments (competing_schedules) are only checked by the caller.
  PERFORM pg_advisory_xact_lock(hashtextextended('cascade_musician:' || p_musician_id, 0));
  IF EXISTS (
    SELECT 1
      FROM contract_offers o
      JOIN project_positions opp ON opp.id = o.project_position_id
      CROSS JOIN LATERAL services_for_position(opp.id) AS theirs
      CROSS JOIN LATERAL services_for_position(v_pos.id) AS ours
     WHERE o.musician_id = p_musician_id
       AND opp.project_id <> v_pos.project_id
       AND (o.status = 'accepted'
            OR (o.status IN ('pending', 'viewed') AND (o.expires_at IS NULL OR o.expires_at >= v_now)))
       AND theirs.start_time < CASE WHEN ours.end_time > ours.start_time THEN ours.end_time
                                    ELSE ours.start_time + interval '3 hours' END
       AND ours.start_time < CASE WHEN theirs.end_time > theirs.start_time THEN theirs.end_time
                                  ELSE theirs.start_time + interval '3 hours' END
  ) THEN
    RETURN jsonb_build_object('result', 'musician_has_conflict');
  END IF;

  BEGIN
    INSERT INTO contract_offers
      (project_position_id, musician_id, status, sent_at, expires_at, custom_pay,
       created_by, terms_snapshot, delivery_status, cascaded_from_offer_id)
    VALUES
      (v_pos.id, p_musician_id, 'pending', v_now, p_expires_at, p_custom_pay,
       NULL, p_terms_snapshot, p_delivery_status, p_trigger_offer_id)
    RETURNING id, token, expires_at, custom_pay, personal_message INTO v_offer;
  EXCEPTION WHEN unique_violation THEN
    -- Only reachable if the chair lock was bypassed; report what stopped it.
    IF EXISTS (SELECT 1 FROM contract_offers WHERE cascaded_from_offer_id = p_trigger_offer_id) THEN
      RETURN jsonb_build_object('result', 'already_cascaded');
    END IF;
    RETURN jsonb_build_object('result', 'chair_has_live_offer');
  END;

  UPDATE project_positions SET status = 'offered' WHERE id = v_pos.id AND status <> 'offered';

  PERFORM log_staffing_event(v_org, 'system', NULL, 'offer', v_offer.id, 'offer.created',
    NULL,
    jsonb_build_object('status', 'pending', 'position_id', v_pos.id, 'musician_id', p_musician_id,
                       'expires_at', v_offer.expires_at, 'cascaded_from_offer_id', p_trigger_offer_id));
  PERFORM log_staffing_event(v_org, 'system', NULL, 'offer', v_offer.id, 'cascade.offered',
    NULL,
    jsonb_build_object('position_id', v_pos.id, 'musician_id', p_musician_id,
                       'trigger_offer_id', p_trigger_offer_id, 'expires_at', v_offer.expires_at,
                       'custom_pay', v_offer.custom_pay));

  RETURN jsonb_build_object(
    'result', 'created',
    'offer', jsonb_build_object('id', v_offer.id, 'token', v_offer.token, 'expires_at', v_offer.expires_at,
                                'custom_pay', v_offer.custom_pay, 'personal_message', v_offer.personal_message));
END;
$$;

REVOKE ALL ON FUNCTION cascade_offer(UUID, UUID, TIMESTAMPTZ, NUMERIC, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cascade_offer(UUID, UUID, TIMESTAMPTZ, NUMERIC, JSONB, TEXT)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 6b. worker_drop: "has the gig started" means this chair's first service
-- ---------------------------------------------------------------------------
--   096's function, unchanged except for the gig_started line: a crew member
--   who only works the evening show can still give it back after the morning
--   load-in has begun. For a chair in 'all' mode the chair's services are the
--   gig's, so the answer is the same as before. The gig page asks the same
--   question of the same services (src/lib/staffing/drop.ts, gigHasStarted).
CREATE OR REPLACE FUNCTION worker_drop(p_offer_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pos_id  UUID;
  v_pos     project_positions%ROWTYPE;
  v_offer   contract_offers%ROWTYPE;
  v_project RECORD;
  v_reason  TEXT := NULLIF(left(btrim(COALESCE(p_reason, '')), 1000), '');
BEGIN
  SELECT project_position_id INTO v_pos_id FROM contract_offers WHERE id = p_offer_id;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  SELECT * INTO v_pos FROM project_positions WHERE id = v_pos_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  SELECT * INTO v_offer FROM contract_offers WHERE id = p_offer_id FOR UPDATE;

  IF v_offer.status = 'released' THEN RETURN 'already_released'; END IF;
  IF v_offer.status IS DISTINCT FROM 'accepted' THEN RETURN 'not_accepted'; END IF;

  SELECT p.status, p.organization_id, o.allow_worker_drop INTO v_project
    FROM projects p JOIN organizations o ON o.id = p.organization_id
   WHERE p.id = v_pos.project_id;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  IF v_project.allow_worker_drop IS NOT TRUE THEN RETURN 'not_allowed'; END IF;
  IF v_project.status IN ('cancelled', 'completed') THEN RETURN 'project_inactive'; END IF;
  IF EXISTS (SELECT 1 FROM services_for_position(v_pos.id) s WHERE s.start_time <= now()) THEN
    RETURN 'gig_started';
  END IF;
  IF v_pos.musician_id IS DISTINCT FROM v_offer.musician_id THEN RETURN 'not_seated'; END IF;
  IF EXISTS (
    SELECT 1 FROM substitution_requests
     WHERE project_position_id = v_pos.id
       AND requesting_musician_id = v_offer.musician_id
       AND status IN ('pending_approval', 'approved')
  ) THEN
    RETURN 'substitution_in_progress';
  END IF;

  UPDATE contract_offers SET status = 'released' WHERE id = p_offer_id;
  UPDATE project_positions SET musician_id = NULL, status = 'vacant' WHERE id = v_pos.id;

  PERFORM log_staffing_event(v_project.organization_id, 'musician', v_offer.musician_id, 'offer', p_offer_id,
    'offer.released',
    jsonb_build_object('status', 'accepted'),
    jsonb_strip_nulls(jsonb_build_object('status', 'released', 'reason', 'dropped', 'position_id', v_pos.id,
                                         'musician_id', v_offer.musician_id, 'seat_released', true,
                                         'note', v_reason)));
  RETURN 'released';
END;
$$;

REVOKE ALL ON FUNCTION worker_drop(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION worker_drop(UUID, TEXT) TO service_role;

-- ===========================================================================
-- verify:
-- SELECT call_scoped_requirements, count(*) FROM organizations GROUP BY 1;   -- only false
-- SELECT scope_mode, count(*) FROM project_positions GROUP BY 1;             -- only 'all'
-- SELECT count(*) FROM position_services;                                    -- 0

-- ---------------------------------------------------------------------------
-- Record that 098 is applied (docs/database-tests.md, "Recording an
-- application"), in the same transaction so it is only recorded if it ran.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('098', '098_position_services')
ON CONFLICT (version) DO NOTHING;

COMMIT;


-- ============================================================================
-- RESULTS — read this table. Every row should say PASS (INFO rows are counts).
-- ============================================================================

SELECT
  'the switch exists, is required, and is off by default' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations'
      AND column_name = 'call_scoped_requirements' AND is_nullable = 'NO' AND column_default = 'false'
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END AS result
UNION ALL
SELECT
  'the switch is off for every organization',
  CASE WHEN NOT EXISTS (SELECT 1 FROM organizations WHERE call_scoped_requirements)
    THEN 'PASS' ELSE 'FAIL - an organization has it on, tell Claude' END
UNION ALL
SELECT
  'only Podium can change the switch (081 freezes it)',
  CASE WHEN position('call_scoped_requirements' IN pg_get_functiondef('public.protect_privileged_org_columns()'::regprocedure)) > 0
    THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'every chair has a setting, "every service" by default',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_positions'
      AND column_name = 'scope_mode' AND is_nullable = 'NO' AND column_default LIKE '''all''%'
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'every existing chair works every service',
  CASE WHEN NOT EXISTS (SELECT 1 FROM project_positions WHERE scope_mode <> 'all')
    THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'the chair setting only accepts "all" / "selected"',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_positions_scope_mode_check' AND conrelid = 'public.project_positions'::regclass
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'the list of a chair''s services exists, with row security on',
  CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.position_services')) IS TRUE
    THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'members read it, admins write it (2 rules)',
  CASE WHEN (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'position_services') = 2
    THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'the five guards are in place',
  CASE WHEN (
    SELECT count(*) FROM pg_trigger
    WHERE tgname IN ('trg_position_services_same_project', 'trg_position_services_project_move',
                     'trg_scope_needs_switch', 'trg_scope_switch_off_guard')
      AND NOT tgisinternal
  ) = 5 THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'auto-offer and "I can''t make it" read the chair''s services',
  CASE WHEN to_regprocedure('public.services_for_position(uuid)') IS NOT NULL
        AND position('services_for_position' IN pg_get_functiondef('public.cascade_offer(uuid, uuid, timestamp with time zone, numeric, jsonb, text)'::regprocedure)) > 0
        AND position('services_for_position' IN pg_get_functiondef('public.worker_drop(uuid, text)'::regprocedure)) > 0
    THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'browsers cannot call the new or changed database steps',
  CASE WHEN NOT has_function_privilege('authenticated', 'public.services_for_position(uuid)', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.services_for_position(uuid)', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public.cascade_offer(uuid, uuid, timestamp with time zone, numeric, jsonb, text)', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public.worker_drop(uuid, text)', 'EXECUTE')
    THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'migration 098 is recorded as applied',
  CASE WHEN EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '098')
    THEN 'PASS' ELSE 'FAIL - tell Claude' END

-- For information only.
UNION ALL
SELECT
  'INFO: chairs (every one works every service)',
  'INFO - ' || (SELECT count(*) FROM project_positions)::text
UNION ALL
SELECT
  'INFO: chair-to-service links (expect 0)',
  'INFO - ' || (SELECT count(*) FROM position_services)::text;
