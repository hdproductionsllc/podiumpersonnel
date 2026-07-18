-- Harden link_musician_records_to_user against arbitrary-email linking.
-- The function is SECURITY DEFINER and previously trusted both parameters,
-- so any client (including anon) could bind another person's unclaimed
-- musician rows to any user id by passing their email. Now the caller may
-- only link rows matching their OWN verified email; the service role keeps
-- full access for server-side flows.
-- Safe to apply anytime: legitimate callers (auth callbacks, login form)
-- already pass the session user's own id + email and are unaffected.

CREATE OR REPLACE FUNCTION link_musician_records_to_user(p_user_id UUID, p_email TEXT)
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
    caller_email TEXT;
BEGIN
    IF (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
        -- Callers may only link records to themselves...
        IF auth.uid() IS NULL OR p_user_id <> auth.uid() THEN
            RETURN 0;
        END IF;
        -- ...and only for their own verified email, regardless of p_email.
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

REVOKE EXECUTE ON FUNCTION link_musician_records_to_user(UUID, TEXT) FROM anon;

-- verify:
-- SELECT proname, proacl FROM pg_proc WHERE proname = 'link_musician_records_to_user';
