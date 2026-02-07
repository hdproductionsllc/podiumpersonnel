-- Fix case-insensitive email matching when linking musician records to auth users.
-- Previously, 'User@Email.com' would not match 'user@email.com' in the database.

CREATE OR REPLACE FUNCTION link_musician_records_to_user(p_user_id UUID, p_email TEXT)
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
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
