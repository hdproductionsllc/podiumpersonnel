-- GO-LIVE SQL — run this whole file once in the Supabase SQL editor (prod).
-- Probed 2026-07-18: 064/065/066/068/069/072 already applied; only 073 + 074
-- + the intake flag flip are pending. Run BEFORE the code deploy.

-- ---------- 073_intake_flag ----------
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS intake_enabled BOOLEAN NOT NULL DEFAULT false;

-- Internal orgs only (David's own ensembles). Meridian + Lonestar are founding
-- customers and deliberately NOT flagged.
UPDATE organizations SET intake_enabled = true WHERE id IN (
  'a0211582-b5fd-4d98-88d7-1d33fa80ca48',  -- Subito String Quartet
  '6edbf230-e43a-42c0-a60d-8cd67be87276',  -- Project String Quartet
  '5ba29961-aac2-4b95-b25a-38e55624c1bd',  -- Project String Quartet (cb10)
  'acd446d8-3fc9-4f56-99f9-0fc23f8792c6'   -- Subito Strings
);

-- ---------- 074_harden_link_musician_rpc ----------
-- Callers may only link musician rows matching their OWN verified email
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

-- ---------- Verification (should print 4 flagged orgs + OK) ----------
SELECT name, intake_enabled FROM organizations ORDER BY intake_enabled DESC, name;
SELECT CASE WHEN prosecdef THEN 'OK: function present (SECURITY DEFINER)' ELSE 'WRONG' END
  FROM pg_proc WHERE proname = 'link_musician_records_to_user';
