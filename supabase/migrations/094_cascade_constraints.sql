-- 094: the cascade CHECK, and the two database functions that make an offer
-- and claim a chair in one transaction (claim_chair, create_offer)
--
-- WHY (architecture audit C, R-1 / R-9 / R-11 / R-13; target architecture
-- sections 3.1 and 4)
--   Nothing in the database stopped two live offers on one chair, two accepted
--   offers on one chair, or a chair marked confirmed with nobody in it. The app
--   avoided those states with conditional updates issued one at a time from
--   the server, which mostly works, but:
--     - accepting a substitute's offer wrote the substitute's 'accepted'
--       BEFORE the original musician's 'released', so for a moment the chair
--       had two accepted offers, and a failure in between left it that way;
--     - an accept that lost the chair to someone else put the loser's offer
--       back to 'pending', so their page offered "Accept" again (R-11);
--     - making an offer was five separate writes (retire the old offer, insert,
--       mark the chair offered, ...), so two admins could interleave.
--   This migration moves the two operations that decide who holds a chair
--   into single database transactions, and adds the one rule today's code
--   already keeps. The two one-offer-per-chair unique indexes are migration
--   095, pasted AFTER the code that uses these functions is deployed, because
--   today's code breaks them in passing (see 095).
--
-- WHAT CHANGES
--   1. substitution_requests.status defaults to 'pending_approval'. The old
--      default 'pending' was refused by the table's own CHECK (026), so any
--      insert that relied on it failed. Every insert in the app names the
--      status, so nothing changes for them.
--   2. Indexes on the foreign keys the cascade reads by: services(project_id),
--      project_positions(project_id), contract_offers(project_position_id),
--      projects(organization_id), instruments(organization_id). The tables are
--      small (a few hundred rows), so plain CREATE INDEX is instant.
--   3. project_positions_confirmed_has_musician: a chair is 'confirmed'
--      exactly when it has a musician.
--   4. claim_chair(offer_id) and create_offer(...): see their own comments.
--      Both are SECURITY DEFINER with a pinned search_path and are callable
--      only by the service role (the server); both write staffing_events (092)
--      in the same transaction as the change.
--
-- BEFORE PASTING
--   092 and 093 must be applied (the functions write staffing_events through
--   log_staffing_event, and read contract_offers.is_substitution); if either
--   is missing this migration stops with a plain-English error.
--   Run scripts/sql/094-repair-before-constraints.paste.sql first. It fixes
--   any chair that would break 3 (production had none on 2026-10-01) and logs
--   each fix to staffing_events. If such a chair is still there, this
--   migration stops with a plain-English error and changes nothing.
--
-- AGAINST TODAY'S CODE (the app as deployed before this step)
--   Safe to paste before the deploy: today's code never calls the two
--   functions, every substitution_requests insert names its status, and every
--   path that seats or unseats a musician sets the chair's status in the same
--   write (checked 2026-10-02: assign, unassign, accept, rescind, the expiry
--   cron, auto-populate, import from book, add position). It refuses only
--   writes that would themselves corrupt a chair:
--     - deleting a musician who is seated in a confirmed chair (the chair
--       would be left confirmed with nobody in it); the delete dialog already
--       says to deactivate instead;
--     - the offers list's "next in line" button marking a chair 'offered'
--       after someone else was seated in it; the button already says the
--       chair could not be marked and to refresh.
--
-- Idempotent and safe to re-run.

-- ---------------------------------------------------------------------------
-- 0. Refuse to run without 092/093, or over chairs the CHECK would reject.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_chairs int;
BEGIN
  IF to_regprocedure('public.log_staffing_event(uuid, text, uuid, text, uuid, text, jsonb, jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Migration 094 stopped, nothing was changed: migration 092 (the staffing history, log_staffing_event) is not applied. Run scripts/sql/092-staffing-events.paste.sql first.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contract_offers' AND column_name = 'is_substitution'
  ) THEN
    RAISE EXCEPTION 'Migration 094 stopped, nothing was changed: migration 093 (the offer columns, contract_offers.is_substitution) is not applied. Run scripts/sql/093-offer-columns.paste.sql first.';
  END IF;

  SELECT count(*) INTO v_chairs FROM project_positions
  WHERE (status = 'confirmed') <> (musician_id IS NOT NULL);

  IF v_chairs > 0 THEN
    RAISE EXCEPTION 'Migration 094 stopped, nothing was changed: % chair(s) confirmed without a musician (or the reverse). Run scripts/sql/094-repair-before-constraints.paste.sql first.',
      v_chairs;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. substitution_requests default
-- ---------------------------------------------------------------------------
ALTER TABLE substitution_requests ALTER COLUMN status SET DEFAULT 'pending_approval';

-- ---------------------------------------------------------------------------
-- 2. Foreign-key indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_services_project ON services (project_id);
CREATE INDEX IF NOT EXISTS idx_project_positions_project ON project_positions (project_id);
CREATE INDEX IF NOT EXISTS idx_contract_offers_position ON contract_offers (project_position_id);
CREATE INDEX IF NOT EXISTS idx_projects_organization ON projects (organization_id);
CREATE INDEX IF NOT EXISTS idx_instruments_organization ON instruments (organization_id);

-- ---------------------------------------------------------------------------
-- 3. A chair is confirmed exactly when someone sits in it
-- ---------------------------------------------------------------------------
ALTER TABLE project_positions DROP CONSTRAINT IF EXISTS project_positions_confirmed_has_musician;
ALTER TABLE project_positions
  ADD CONSTRAINT project_positions_confirmed_has_musician
  CHECK ((status = 'confirmed') = (musician_id IS NOT NULL));

-- ---------------------------------------------------------------------------
-- 4a. claim_chair: a musician accepts an offer
-- ---------------------------------------------------------------------------
--   One transaction. Locks the chair, then the offer (create_offer takes the
--   same order, so the two never deadlock), and returns one of:
--
--     claimed            the offer is accepted and the chair is theirs
--     already_responded  the offer is gone, answered, withdrawn or past its
--                        deadline; nothing changed
--     position_filled    the chair went to someone else first. The offer is
--                        retired as 'superseded' (it used to go back to
--                        'pending', which offered "Accept" again: R-11), and a
--                        substitute's request is closed as 'cancelled' (S11)
--     project_inactive   the gig is cancelled or completed; nothing changed
--     musician_inactive  the musician was deactivated; nothing changed
--
--   A substitute's offer (an 'approved' substitution request points at it)
--   takes the chair from the musician who asked for cover, and only from them.
--   The original's accepted offer is released BEFORE the substitute's is
--   accepted, so the one-accepted-offer index (095) never sees two. Any other open
--   offer on the chair is retired, since the chair is now filled.
--
--   Every change is recorded in staffing_events, the musician as the actor.
CREATE OR REPLACE FUNCTION claim_chair(p_offer_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_position_id UUID;
  v_pos         project_positions%ROWTYPE;
  v_offer       contract_offers%ROWTYPE;
  v_sub         substitution_requests%ROWTYPE;
  v_is_sub      BOOLEAN;
  v_org         UUID;
  v_project_status TEXT;
  v_active      BOOLEAN;
  v_now         TIMESTAMPTZ := now();
  r             RECORD;
  s             RECORD;
BEGIN
  SELECT project_position_id INTO v_position_id FROM contract_offers WHERE id = p_offer_id;
  IF NOT FOUND THEN
    RETURN 'already_responded';
  END IF;

  SELECT * INTO v_pos FROM project_positions WHERE id = v_position_id FOR UPDATE;
  SELECT * INTO v_offer FROM contract_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND
     OR v_offer.status NOT IN ('pending', 'viewed')
     OR (v_offer.expires_at IS NOT NULL AND v_offer.expires_at < v_now) THEN
    RETURN 'already_responded';
  END IF;

  SELECT status, organization_id INTO v_project_status, v_org FROM projects WHERE id = v_pos.project_id;
  IF v_project_status IN ('cancelled', 'completed') THEN
    RETURN 'project_inactive';
  END IF;

  SELECT is_active INTO v_active FROM musicians WHERE id = v_offer.musician_id;
  IF v_active IS FALSE THEN
    RETURN 'musician_inactive';
  END IF;

  SELECT * INTO v_sub FROM substitution_requests
  WHERE offer_id = p_offer_id AND status = 'approved'
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;
  v_is_sub := FOUND;

  -- Lost the chair: a substitute needs it still held by the one they replace;
  -- anyone else needs it empty.
  IF (v_is_sub AND v_pos.musician_id IS DISTINCT FROM v_sub.requesting_musician_id)
     OR (NOT v_is_sub AND v_pos.musician_id IS NOT NULL) THEN
    UPDATE contract_offers SET status = 'superseded', responded_at = v_now WHERE id = p_offer_id;
    PERFORM log_staffing_event(v_org, 'musician', v_offer.musician_id, 'offer', p_offer_id, 'offer.superseded',
      jsonb_build_object('status', v_offer.status),
      jsonb_build_object('status', 'superseded', 'reason', 'position_filled',
                         'position_id', v_pos.id, 'musician_id', v_offer.musician_id));
    IF v_is_sub THEN
      UPDATE substitution_requests SET status = 'cancelled' WHERE id = v_sub.id;
      PERFORM log_staffing_event(v_org, 'musician', v_offer.musician_id, 'substitution_request', v_sub.id,
        'substitution.ended',
        jsonb_build_object('status', 'approved'),
        jsonb_build_object('status', 'cancelled', 'reason', 'position_filled', 'offer_id', p_offer_id));
    END IF;
    RETURN 'position_filled';
  END IF;

  -- A substitute: release the original musician first.
  IF v_is_sub THEN
    FOR r IN
      UPDATE contract_offers SET status = 'released'
      WHERE project_position_id = v_pos.id
        AND musician_id = v_sub.requesting_musician_id
        AND status = 'accepted'
      RETURNING id
    LOOP
      PERFORM log_staffing_event(v_org, 'musician', v_offer.musician_id, 'offer', r.id, 'offer.released',
        jsonb_build_object('status', 'accepted'),
        jsonb_build_object('status', 'released', 'reason', 'substitute_accepted',
                           'musician_id', v_sub.requesting_musician_id, 'substitution_request_id', v_sub.id));
    END LOOP;
  END IF;

  UPDATE contract_offers SET status = 'accepted', responded_at = v_now WHERE id = p_offer_id;
  UPDATE project_positions SET musician_id = v_offer.musician_id, status = 'confirmed' WHERE id = v_pos.id;
  PERFORM log_staffing_event(v_org, 'musician', v_offer.musician_id, 'offer', p_offer_id, 'offer.accepted',
    jsonb_build_object('status', v_offer.status),
    jsonb_strip_nulls(jsonb_build_object('status', 'accepted', 'position_id', v_pos.id,
                                         'musician_id', v_offer.musician_id,
                                         'substitution_request_id', CASE WHEN v_is_sub THEN v_sub.id END)));

  IF v_is_sub THEN
    UPDATE substitution_requests SET status = 'filled' WHERE id = v_sub.id;
    PERFORM log_staffing_event(v_org, 'musician', v_offer.musician_id, 'substitution_request', v_sub.id,
      'substitution.filled',
      jsonb_build_object('status', 'approved'),
      jsonb_build_object('status', 'filled', 'offer_id', p_offer_id, 'substitute_musician_id', v_offer.musician_id));
  END IF;

  -- The chair is filled: nobody else's open offer on it can be taken up. A
  -- competing substitute's request for the same chair ends with it.
  FOR r IN
    UPDATE contract_offers SET status = 'superseded', responded_at = v_now
    WHERE project_position_id = v_pos.id AND id <> p_offer_id AND status IN ('pending', 'viewed')
    RETURNING id, musician_id
  LOOP
    PERFORM log_staffing_event(v_org, 'musician', v_offer.musician_id, 'offer', r.id, 'offer.superseded',
      NULL,
      jsonb_build_object('status', 'superseded', 'reason', 'chair_filled', 'position_id', v_pos.id,
                         'musician_id', r.musician_id, 'replaced_by', p_offer_id));
    FOR s IN
      UPDATE substitution_requests SET status = 'cancelled'
      WHERE offer_id = r.id AND status = 'approved'
      RETURNING id
    LOOP
      PERFORM log_staffing_event(v_org, 'musician', v_offer.musician_id, 'substitution_request', s.id,
        'substitution.ended',
        jsonb_build_object('status', 'approved'),
        jsonb_build_object('status', 'cancelled', 'reason', 'chair_filled', 'offer_id', r.id));
    END LOOP;
  END LOOP;

  RETURN 'claimed';
END;
$$;

REVOKE ALL ON FUNCTION claim_chair(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_chair(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 4b. create_offer: an admin offers a chair to a musician
-- ---------------------------------------------------------------------------
--   One transaction. Locks the chair, checks, retires the chair's open offers
--   (when p_supersede, the default), inserts the new offer, marks the chair
--   offered, and records it. The email is sent by the server afterwards
--   (src/lib/staffing/offers.ts), never from in here.
--
--   Returns jsonb. On success:
--     { "result": "created",
--       "offer": { id, token, expires_at, custom_pay, personal_message },
--       "superseded": [ { id, musician_id, previous_status, expires_at,
--                         is_substitution }, ... ] }
--   Otherwise { "result": <reason> } and nothing changed, reason one of:
--     not_found (with "what": position | musician), forbidden (p_created_by is
--     not an owner/admin of the gig's organization), wrong_organization,
--     gig_closed, musician_inactive, chair_filled, musician_has_active_offer
--     (an open or accepted offer anywhere on this gig), chair_has_live_offer
--     (only when p_supersede is false).
--
--   The checks run in the same order as the server's old ones, so the reason
--   an admin is given does not change. Two calls for one chair queue on the
--   chair's lock; two for one musician on the same gig queue on an advisory
--   lock, so the "already has an offer on this gig" check cannot be raced.
--   The one-live-offer index (095) is the backstop for any other writer.
--
--   A substitute's open offer on the chair is retired with the rest: the chair
--   is empty, so the musician they were covering has left it and that offer
--   could never be accepted (claim_chair would refuse it). Its approved
--   substitution request is closed as 'cancelled', as claim_chair does when a
--   chair fills, so no request is left pointing at a retired offer.
--
--   Pay is stored exactly as given (custom_pay is the fee for the whole gig);
--   nothing here computes or changes an amount.
CREATE OR REPLACE FUNCTION create_offer(
  p_position_id      UUID,
  p_musician_id      UUID,
  p_created_by       UUID,
  p_expires_at       TIMESTAMPTZ DEFAULT NULL,
  p_custom_pay       NUMERIC DEFAULT NULL,
  p_personal_message TEXT DEFAULT NULL,
  p_terms_snapshot   JSONB DEFAULT NULL,
  p_delivery_status  TEXT DEFAULT NULL,
  p_supersede        BOOLEAN DEFAULT true
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pos       project_positions%ROWTYPE;
  v_org       UUID;
  v_project_status TEXT;
  v_role      TEXT;
  v_m_org     UUID;
  v_m_active  BOOLEAN;
  v_offer     RECORD;
  v_retired   JSONB := '[]'::jsonb;
  v_now       TIMESTAMPTZ := now();
  r           RECORD;
  s           RECORD;
BEGIN
  SELECT * INTO v_pos FROM project_positions WHERE id = p_position_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'not_found', 'what', 'position');
  END IF;

  SELECT status, organization_id INTO v_project_status, v_org FROM projects WHERE id = v_pos.project_id;

  SELECT role INTO v_role FROM organization_members
  WHERE user_id = p_created_by AND organization_id = v_org;
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('result', 'forbidden');
  END IF;

  SELECT organization_id, is_active INTO v_m_org, v_m_active FROM musicians WHERE id = p_musician_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'not_found', 'what', 'musician');
  END IF;
  IF v_m_org IS DISTINCT FROM v_org THEN
    RETURN jsonb_build_object('result', 'wrong_organization');
  END IF;
  IF v_project_status IN ('cancelled', 'completed') THEN
    RETURN jsonb_build_object('result', 'gig_closed');
  END IF;
  IF v_m_active IS FALSE THEN
    RETURN jsonb_build_object('result', 'musician_inactive');
  END IF;
  IF v_pos.musician_id IS NOT NULL THEN
    RETURN jsonb_build_object('result', 'chair_filled');
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

  IF p_supersede THEN
    FOR r IN
      SELECT id, musician_id, status, expires_at, is_substitution FROM contract_offers
      WHERE project_position_id = p_position_id AND status IN ('pending', 'viewed')
      ORDER BY sent_at NULLS FIRST, id
      FOR UPDATE
    LOOP
      UPDATE contract_offers SET status = 'superseded', responded_at = v_now WHERE id = r.id;
      v_retired := v_retired || jsonb_build_array(jsonb_build_object(
        'id', r.id, 'musician_id', r.musician_id, 'previous_status', r.status, 'expires_at', r.expires_at,
        'is_substitution', r.is_substitution));
    END LOOP;
  ELSIF EXISTS (
    SELECT 1 FROM contract_offers
    WHERE project_position_id = p_position_id AND status IN ('pending', 'viewed') AND is_substitution = false
  ) THEN
    RETURN jsonb_build_object('result', 'chair_has_live_offer');
  END IF;

  INSERT INTO contract_offers
    (project_position_id, musician_id, status, sent_at, expires_at, custom_pay, personal_message,
     created_by, terms_snapshot, delivery_status)
  VALUES
    (p_position_id, p_musician_id, 'pending', v_now, p_expires_at, p_custom_pay, p_personal_message,
     p_created_by, p_terms_snapshot, p_delivery_status)
  RETURNING id, token, expires_at, custom_pay, personal_message INTO v_offer;

  -- Advisory (the chair is empty, so it is not 'confirmed'); kept for the
  -- screens that read the chair's status.
  UPDATE project_positions SET status = 'offered' WHERE id = p_position_id AND status <> 'offered';

  FOR r IN SELECT * FROM jsonb_to_recordset(v_retired) AS x(id UUID, musician_id UUID) LOOP
    PERFORM log_staffing_event(v_org, 'admin', p_created_by, 'offer', r.id, 'offer.superseded',
      NULL,
      jsonb_build_object('status', 'superseded', 'position_id', p_position_id,
                         'musician_id', r.musician_id, 'replaced_by', v_offer.id));
    FOR s IN
      UPDATE substitution_requests SET status = 'cancelled'
      WHERE offer_id = r.id AND status = 'approved'
      RETURNING id
    LOOP
      PERFORM log_staffing_event(v_org, 'admin', p_created_by, 'substitution_request', s.id,
        'substitution.ended',
        jsonb_build_object('status', 'approved'),
        jsonb_build_object('status', 'cancelled', 'reason', 'offer_superseded', 'offer_id', r.id,
                           'replaced_by', v_offer.id));
    END LOOP;
  END LOOP;
  PERFORM log_staffing_event(v_org, 'admin', p_created_by, 'offer', v_offer.id, 'offer.created',
    NULL,
    jsonb_build_object('status', 'pending', 'position_id', p_position_id, 'musician_id', p_musician_id,
                       'expires_at', v_offer.expires_at));

  RETURN jsonb_build_object(
    'result', 'created',
    'offer', jsonb_build_object('id', v_offer.id, 'token', v_offer.token, 'expires_at', v_offer.expires_at,
                                'custom_pay', v_offer.custom_pay, 'personal_message', v_offer.personal_message),
    'superseded', v_retired);
END;
$$;

REVOKE ALL ON FUNCTION create_offer(UUID, UUID, UUID, TIMESTAMPTZ, NUMERIC, TEXT, JSONB, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_offer(UUID, UUID, UUID, TIMESTAMPTZ, NUMERIC, TEXT, JSONB, TEXT, BOOLEAN)
  TO service_role;

-- ===========================================================================
-- verify:
-- SELECT conname FROM pg_constraint WHERE conname = 'project_positions_confirmed_has_musician'; -- 1 row
-- SELECT column_default FROM information_schema.columns
--   WHERE table_name = 'substitution_requests' AND column_name = 'status';                     -- 'pending_approval'::text
-- SELECT has_function_privilege('authenticated', 'claim_chair(uuid)', 'EXECUTE');              -- f
-- SELECT has_function_privilege('service_role', 'claim_chair(uuid)', 'EXECUTE');               -- t
