-- ============================================================================
-- PODIUM — AUTO-OFFER AND "I CAN'T MAKE IT" SWITCHES (migration 096, 2026-10-02)
--
-- HOW TO RUN — BEFORE the code that uses it is deployed
--   1. Supabase Dashboard -> SQL Editor -> New query
--   2. Paste this ENTIRE file -> Run
--   3. Read the "RESULTS" table printed at the very bottom. Every row should
--      say PASS (rows marked INFO are just counts for you to read). If one
--      says FAIL, paste the whole output back to Claude.
--
-- Safe to run more than once: the second run changes nothing, and it never
-- undoes a switch you have flipped since. It runs inside one transaction, so
-- if any statement errors NOTHING is applied — paste the error back to Claude.
--
-- WHAT IT DOES, in plain English
--   Adds three switches and the database steps that read them. None of it
--   changes anything today:
--
--   * "Auto-offer to the next person" for each organization. OFF for every
--     organization. While it is off, Podium behaves exactly as it does now.
--   * "Let people drop out themselves" for each organization. OFF for your
--     music organizations (musicians keep asking for a substitute, as now),
--     ON for the other kinds of organization. Nothing uses it until the
--     "I can't make it" button ships.
--   * "Don't auto-offer this chair", one per chair. Off everywhere.
--   * A note on each offer of which earlier offer caused it, with a database
--     rule that one declined or expired offer can cause at most one automatic
--     offer, however many times the system tries.
--   * A note on each ended offer that "nobody was left" was already emailed,
--     so that email goes out once, not every time the system looks.
--   * The two database steps the automatic offer uses ("offer this chair to
--     the next person", "nobody is left, tell the admins once"). They check
--     the organization's switch themselves and do nothing while it is off.
--     They also refuse to offer a chair to someone who already turned that
--     chair down (or let it lapse), or who is booked on another gig at the
--     same time.
--   * The database step behind the "I can't make it" button: someone who
--     accepted gives the gig back, in one go (their offer is closed, the
--     chair is empty again, and it is written in the history). It refuses
--     unless the organization's drop-out switch is on and the gig has not
--     started, so for your music organizations it does nothing.
--
--   Nothing here changes pay, who is emailed, or what emails say.
--
--   Already pasted an earlier copy of this file? Paste this one too: it adds
--   what is new and leaves everything else (and any switch you set) alone.
--
-- Body below is supabase/migrations/096_auto_cascade_settings.sql, copied
-- verbatim, followed by the migrations-log entry.
-- ============================================================================

BEGIN;

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
--   6. contract_offers.cascade_exhausted_at timestamptz NULL. Set on a
--      declined, expired or dropped offer when the cascade found nobody left
--      to offer the chair to and the admins were told. Set once, so that
--      "nobody left" email goes out at most once per exhaustion.
--   7. cascade_offer(...) and mark_cascade_exhausted(...): the cascade's two
--      writes, each ONE transaction that locks the chair (the same lock order
--      as claim_chair and create_offer), re-checks every reason to stop
--      (cascade_refusal), and records itself in staffing_events as the
--      system. Service role only. See their own comments.
--   8. worker_drop(...): a worker who accepted gives the gig back ("I can't
--      make it" on the gig page), when the organization has allow_worker_drop
--      on and the gig has not started. One transaction: the offer becomes
--      'released', the chair vacant, and offer.released is recorded with
--      reason 'dropped'. Service role only. See its own comment.
--
-- Nothing in today's code reads these, and every default reproduces today's
-- behaviour, so this is safe to paste BEFORE the code that uses it (house
-- rule: migration first). The functions do nothing unless an organization
-- has auto_cascade on, which nobody has.
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
  IF to_regprocedure('public.log_staffing_event(uuid, text, uuid, text, uuid, text, jsonb, jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Migration 096 stopped, nothing was changed: log_staffing_event (migration 092) is missing.';
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

-- ---------------------------------------------------------------------------
-- 6. "Nobody left" was told, at most once per ended offer
-- ---------------------------------------------------------------------------
ALTER TABLE contract_offers
  ADD COLUMN IF NOT EXISTS cascade_exhausted_at timestamptz;

COMMENT ON COLUMN contract_offers.cascade_exhausted_at IS
  'Set on a declined, expired or dropped offer when the auto-cascade found nobody left to offer the chair to and emailed the admins. Set once: that email goes out at most once per exhaustion.';

-- ---------------------------------------------------------------------------
-- 7a. cascade_refusal: every reason the cascade stops, in one place
-- ---------------------------------------------------------------------------
--   Called by cascade_offer and mark_cascade_exhausted with the chair already
--   locked. Returns NULL when the cascade may act on this ended offer, else
--   the reason it does nothing:
--
--     not_found             no such offer, or its chair is gone
--     auto_off              the organization has auto_cascade off
--     chair_opted_out       the chair has auto_cascade_disabled on
--     gig_closed            the gig is cancelled or completed
--     gig_not_active        the gig is not active (a draft)
--     trigger_not_ended     the offer is not declined, expired or released
--     already_cascaded      this offer already caused a cascaded offer
--     already_exhausted     this offer already ran the list out
--     chair_filled          someone holds the chair
--     chair_has_live_offer  the chair already has an offer waiting on an answer
--
--   src/lib/staffing/cascade.ts (planCascade) checks the same list in the same
--   order before it ranks anyone; this is the check that counts, under the lock.
CREATE OR REPLACE FUNCTION cascade_refusal(p_trigger_offer_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trigger RECORD;
  v_pos     RECORD;
  v_project RECORD;
BEGIN
  SELECT id, status, project_position_id, cascade_exhausted_at INTO v_trigger
    FROM contract_offers WHERE id = p_trigger_offer_id;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  SELECT id, project_id, musician_id, auto_cascade_disabled INTO v_pos
    FROM project_positions WHERE id = v_trigger.project_position_id;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  SELECT p.status, o.auto_cascade INTO v_project
    FROM projects p JOIN organizations o ON o.id = p.organization_id
   WHERE p.id = v_pos.project_id;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  IF v_project.auto_cascade IS NOT TRUE THEN RETURN 'auto_off'; END IF;
  IF v_pos.auto_cascade_disabled THEN RETURN 'chair_opted_out'; END IF;
  IF v_project.status IN ('cancelled', 'completed') THEN RETURN 'gig_closed'; END IF;
  IF v_project.status IS DISTINCT FROM 'active' THEN RETURN 'gig_not_active'; END IF;
  IF v_trigger.status NOT IN ('declined', 'expired', 'released') THEN RETURN 'trigger_not_ended'; END IF;
  IF EXISTS (SELECT 1 FROM contract_offers WHERE cascaded_from_offer_id = p_trigger_offer_id) THEN
    RETURN 'already_cascaded';
  END IF;
  IF v_trigger.cascade_exhausted_at IS NOT NULL THEN RETURN 'already_exhausted'; END IF;
  IF v_pos.musician_id IS NOT NULL THEN RETURN 'chair_filled'; END IF;
  IF EXISTS (
    SELECT 1 FROM contract_offers
    WHERE project_position_id = v_pos.id AND status IN ('pending', 'viewed')
  ) THEN
    RETURN 'chair_has_live_offer';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION cascade_refusal(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cascade_refusal(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 7b. cascade_offer: offer the chair of an ended offer to the next person
-- ---------------------------------------------------------------------------
--   One transaction. Locks the chair (the order claim_chair and create_offer
--   use, so none of them deadlock), checks cascade_refusal, checks the
--   musician (same organization, active, no live or accepted offer on this
--   gig, under create_offer's per-musician lock; has not already had a turn at
--   this chair; not booked on another gig at the same time, under a lock per
--   musician that every automatic offer takes last), then inserts the offer with
--   cascaded_from_offer_id = the ended offer, marks the chair offered, and
--   records offer.created and cascade.offered as the system. created_by stays
--   NULL: no admin sent it.
--
--   The caller (cascade.ts) chose the musician and the terms (the ended
--   offer's pay, leader-fee choice and response window). p_expires_at must be
--   in the future: an offer with no time to answer is not made.
--
--   Returns {result: 'created', offer: {...}} or {result: <reason>}, where the
--   reason is one of cascade_refusal's or no_time_left, musician_not_found,
--   wrong_organization, musician_inactive, musician_has_active_offer,
--   musician_had_turn, musician_has_conflict. Two
--   callers for the same ended offer queue on the chair's lock and the second
--   gets already_cascaded; if one ever slipped past, the unique index
--   contract_offers_one_cascade_per_trigger refuses its row and it gets
--   already_cascaded too.
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
  -- waiting inside its deadline, whose services overlap this gig's (a service
  -- with no usable end time counts as 3 hours, as src/lib/staffing/conflicts.ts
  -- does). The caller checked this too, but two automatic offers on different
  -- gigs could each have read "free"; they queue on this lock, taken last so it
  -- cannot deadlock with the locks above, and the second sees the first.
  -- Outside commitments (competing_schedules) are only checked by the caller.
  PERFORM pg_advisory_xact_lock(hashtextextended('cascade_musician:' || p_musician_id, 0));
  IF EXISTS (
    SELECT 1
      FROM contract_offers o
      JOIN project_positions opp ON opp.id = o.project_position_id
      JOIN services theirs ON theirs.project_id = opp.project_id
      JOIN services ours ON ours.project_id = v_pos.project_id
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
-- 7c. mark_cascade_exhausted: the list ran out, claim the right to say so once
-- ---------------------------------------------------------------------------
--   One transaction. Locks the chair, checks cascade_refusal (so a cascaded
--   offer that landed first, a filled chair or a switched-off organization
--   means nobody is told the list ran out), then sets cascade_exhausted_at on
--   the ended offer and records cascade.exhausted as the system. Returns
--   'marked' (the caller sends the one admin email) or the refusal reason;
--   a second call for the same offer gets 'already_exhausted'.
--
--   p_details: what the caller saw, added to the cascade.exhausted event
--   (how many were passed over for a conflict, who was free but had no email).
--
--   An earlier draft of this file had no p_details; drop that one so only one
--   mark_cascade_exhausted exists.
DROP FUNCTION IF EXISTS mark_cascade_exhausted(UUID);

CREATE OR REPLACE FUNCTION mark_cascade_exhausted(p_trigger_offer_id UUID, p_details JSONB DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pos_id  UUID;
  v_org     UUID;
  v_refusal TEXT;
BEGIN
  SELECT project_position_id INTO v_pos_id FROM contract_offers WHERE id = p_trigger_offer_id;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  PERFORM 1 FROM project_positions WHERE id = v_pos_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  v_refusal := cascade_refusal(p_trigger_offer_id);
  IF v_refusal IS NOT NULL THEN RETURN v_refusal; END IF;

  UPDATE contract_offers SET cascade_exhausted_at = now()
   WHERE id = p_trigger_offer_id AND cascade_exhausted_at IS NULL;

  SELECT p.organization_id INTO v_org
    FROM project_positions pp JOIN projects p ON p.id = pp.project_id
   WHERE pp.id = v_pos_id;
  PERFORM log_staffing_event(v_org, 'system', NULL, 'offer', p_trigger_offer_id, 'cascade.exhausted',
    NULL,
    COALESCE(p_details, '{}'::jsonb) || jsonb_build_object('position_id', v_pos_id));
  RETURN 'marked';
END;
$$;

REVOKE ALL ON FUNCTION mark_cascade_exhausted(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mark_cascade_exhausted(UUID, JSONB) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. worker_drop: "I can't make it" from the gig page
-- ---------------------------------------------------------------------------
--   One transaction. A worker who accepted gives the gig back. Locks the chair,
--   then the offer (claim_chair's order, so the two never deadlock), and
--   returns one of:
--
--     released                  the offer is 'released' and the chair is vacant
--     already_released          a second press of the button; nothing changed
--     not_found                 no such offer, or its chair is gone
--     not_accepted              the offer was never accepted (or ended another way)
--     not_allowed               the organization has allow_worker_drop off
--     project_inactive          the gig is cancelled or completed
--     gig_started               the gig's first service has started
--     not_seated                the chair is not theirs (someone else holds it)
--     substitution_in_progress  they asked for a substitute who is not settled
--                               yet; the admin sorts that out first
--
--   p_reason is the worker's optional note, kept on the offer.released event
--   (never written over response_notes, which hold their earlier answer).
--   Recorded as offer.released with reason 'dropped', the worker as the actor.
--   The admin email and the auto-offer (cascade_offer, trigger 'dropped') are
--   the server's, afterwards (src/lib/staffing/drop.ts).
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
  IF EXISTS (SELECT 1 FROM services WHERE project_id = v_pos.project_id AND start_time <= now()) THEN
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
-- SELECT vertical, allow_worker_drop, auto_cascade, count(*) FROM organizations GROUP BY 1, 2, 3;
--   music_contractor / orchestra_band rows: allow_worker_drop false; others true; auto_cascade all false
-- SELECT indexname FROM pg_indexes WHERE indexname = 'contract_offers_one_cascade_per_trigger';   -- 1 row

-- ---------------------------------------------------------------------------
-- Record that 096 is applied (docs/database-tests.md, "Recording an
-- application"), in the same transaction so it is only recorded if it ran.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('096', '096_auto_cascade_settings')
ON CONFLICT (version) DO NOTHING;

COMMIT;


-- ============================================================================
-- RESULTS — read this table. Every row should say PASS (INFO rows are counts).
-- ============================================================================

SELECT
  'organizations have the auto-offer switch, off unless set' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'auto_cascade'
      AND data_type = 'boolean' AND is_nullable = 'NO' AND column_default = 'false'
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END AS result
UNION ALL
SELECT
  'organizations have the drop-out switch, never empty',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'allow_worker_drop'
      AND data_type = 'boolean' AND is_nullable = 'NO'
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'new organizations get the drop-out switch from their type',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_set_allow_worker_drop_default' AND tgrelid = 'public.organizations'::regclass
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'chairs have the "don''t auto-offer this chair" switch, off unless set',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_positions' AND column_name = 'auto_cascade_disabled'
      AND data_type = 'boolean' AND is_nullable = 'NO' AND column_default = 'false'
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'offers can record which offer caused them',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contract_offers' AND column_name = 'cascaded_from_offer_id'
      AND data_type = 'uuid' AND is_nullable = 'YES'
  ) AND EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.contract_offers'::regclass AND contype = 'f'
      AND confrelid = 'public.contract_offers'::regclass AND confdeltype = 'n'
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.contract_offers'::regclass AND attname = 'cascaded_from_offer_id')]
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'one declined/expired offer can cause at most one automatic offer',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'contract_offers_one_cascade_per_trigger'
      AND indexdef LIKE 'CREATE UNIQUE INDEX%'
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'ended offers can record that "nobody left" was emailed',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contract_offers' AND column_name = 'cascade_exhausted_at'
      AND is_nullable = 'YES'
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'the automatic-offer steps exist and only the server can run them',
  CASE WHEN (
    SELECT count(*) FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('cascade_offer', 'mark_cascade_exhausted', 'cascade_refusal')
      AND has_function_privilege('service_role', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
  ) = 3 THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'the "I can''t make it" step exists and only the server can run it',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = 'worker_drop'
      AND has_function_privilege('service_role', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
  ) THEN 'PASS' ELSE 'FAIL - tell Claude' END
UNION ALL
SELECT
  'music organizations keep the substitute flow (drop-out off)',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM organizations
    WHERE vertical IN ('music_contractor', 'orchestra_band') AND allow_worker_drop
  ) THEN 'PASS' ELSE 'INFO - ' || (
    SELECT count(*) FROM organizations
    WHERE vertical IN ('music_contractor', 'orchestra_band') AND allow_worker_drop
  ) || ' music organization(s) have drop-out switched on (by an admin since the first run?)' END
UNION ALL
SELECT
  'organizations with auto-offer switched on',
  'INFO - ' || (SELECT count(*) FROM organizations WHERE auto_cascade) || ' of ' || (SELECT count(*) FROM organizations)
UNION ALL
SELECT
  'migration 096 is recorded as applied',
  CASE WHEN EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '096')
    THEN 'PASS' ELSE 'FAIL - tell Claude' END;
