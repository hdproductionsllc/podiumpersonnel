-- Enforce portal invite token expiry in the activation function
-- Previously, expired tokens could still be used to activate accounts
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
    AND user_id IS NULL
    AND (portal_invite_expires_at IS NULL OR portal_invite_expires_at > NOW());

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
