-- Fix #1: Add SECURITY DEFINER function for token-based activation
-- The direct client update was blocked by RLS because user_id is NULL during activation
CREATE OR REPLACE FUNCTION activate_musician_by_token(p_user_id UUID, p_token TEXT)
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE musicians
    SET user_id = p_user_id,
        portal_invite_token = NULL,
        portal_invite_sent_at = NULL,
        portal_invite_expires_at = NULL
    WHERE portal_invite_token = p_token
    AND user_id IS NULL;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix #2: Add SECURITY DEFINER function for token lookup and drop the overly-broad SELECT policy.
-- The old policy granted SELECT to ALL musicians with any active invite token,
-- not just the one matching the request. This replaces it with a scoped function.
CREATE OR REPLACE FUNCTION get_musician_by_invite_token(p_token TEXT)
RETURNS TABLE(
    id UUID,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    portal_invite_expires_at TIMESTAMPTZ,
    user_id UUID,
    organization_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.first_name,
        m.last_name,
        m.email,
        m.portal_invite_expires_at,
        m.user_id,
        o.name AS organization_name
    FROM musicians m
    JOIN organizations o ON m.organization_id = o.id
    WHERE m.portal_invite_token = p_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the overly-broad SELECT policy
DROP POLICY IF EXISTS "Public can view musician by portal invite token" ON musicians;
