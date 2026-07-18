-- ============================================================
-- Podium launch: pending migrations (2026-06-09)
-- Paste this whole file into Supabase SQL editor and Run.
-- Every statement is idempotent — safe to run more than once.
-- Combines: 047, 059, 062, 063, 064 (051 verified already applied).
-- ============================================================

-- ---------- 047_ensure_rls_all_tables ----------
-- Enable RLS on every public table (fixes Security Advisor warnings).
DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE 'pg_%'
      AND tablename NOT LIKE '_prisma_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl.tablename);
  END LOOP;
END;
$$;

-- ---------- 059_backfill_service_venue_ids ----------
-- Link services to venue records by exact name match within the same org.
UPDATE services s
SET venue_id = v.id
FROM venues v, projects p
WHERE p.id = s.project_id
  AND s.venue IS NOT NULL
  AND s.venue_id IS NULL
  AND v.name = s.venue
  AND v.organization_id = p.organization_id;

UPDATE services s
SET venue_id_2 = v.id
FROM venues v, projects p
WHERE p.id = s.project_id
  AND s.venue_2 IS NOT NULL
  AND s.venue_id_2 IS NULL
  AND v.name = s.venue_2
  AND v.organization_id = p.organization_id;

-- ---------- 062_protect_payment_records ----------
-- Payments can no longer be cascade-deleted via musician or project deletion.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_musician_id_fkey;
ALTER TABLE payments
  ADD CONSTRAINT payments_musician_id_fkey
  FOREIGN KEY (musician_id) REFERENCES musicians(id) ON DELETE RESTRICT;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_service_id_fkey;
ALTER TABLE payments
  ADD CONSTRAINT payments_service_id_fkey
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT;

-- ---------- 063_add_released_offer_status ----------
-- REQUIRED BEFORE DEPLOY: accept routes now write status='released'
-- when a substitute takes over an accepted chair.
ALTER TABLE contract_offers DROP CONSTRAINT IF EXISTS contract_offers_status_check;
ALTER TABLE contract_offers
  ADD CONSTRAINT contract_offers_status_check
  CHECK (status IN ('pending', 'viewed', 'accepted', 'declined', 'rescinded', 'expired', 'released'));

-- ---------- 064_stripe_event_idempotency ----------
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;

-- ---------- 073_intake_flag ----------
-- Internal-only intake / Book Builder feature flag. Additive, defaulted false;
-- the gated code fails closed until an org's flag is flipped on by hand.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS intake_enabled BOOLEAN NOT NULL DEFAULT false;

-- ---------- 074_harden_link_musician_rpc ----------
-- Caller may only link musician rows matching their OWN verified email
-- (service role exempt); anon execute revoked.
CREATE OR REPLACE FUNCTION link_musician_records_to_user(p_user_id UUID, p_email TEXT)
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
    caller_email TEXT;
BEGIN
    IF (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
        IF auth.uid() IS NULL OR p_user_id <> auth.uid() THEN
            RETURN 0;
        END IF;
        SELECT email INTO caller_email
        FROM auth.users
        WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL;
        IF caller_email IS NULL OR LOWER(caller_email) <> LOWER(p_email) THEN
            RETURN 0;
        END IF;
    END IF;

    UPDATE musicians
    SET user_id = p_user_id,
        portal_invite_token = NULL,
        portal_invite_sent_at = NULL,
        portal_invite_expires_at = NULL
    WHERE LOWER(email) = LOWER(p_email)
    AND user_id IS NULL;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION link_musician_records_to_user(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION link_musician_records_to_user(UUID, TEXT) TO authenticated, service_role;

-- ---------- Verification (prints results; all should say OK) ----------
SELECT
  (SELECT CASE WHEN COUNT(*) = 0 THEN 'WARN: some public tables lack RLS' ELSE 'OK: RLS enabled everywhere' END
   FROM (SELECT 1 FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity LIMIT 1) x) AS rls_check,
  (SELECT CASE WHEN confdeltype = 'r' THEN 'OK: payments.musician_id RESTRICT' ELSE 'WRONG' END
   FROM pg_constraint WHERE conname = 'payments_musician_id_fkey') AS payments_fk_check,
  (SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%released%' THEN 'OK: released status allowed' ELSE 'WRONG' END
   FROM pg_constraint WHERE conname = 'contract_offers_status_check') AS released_check,
  (SELECT CASE WHEN to_regclass('public.stripe_events') IS NOT NULL THEN 'OK: stripe_events exists' ELSE 'WRONG' END) AS stripe_events_check;
