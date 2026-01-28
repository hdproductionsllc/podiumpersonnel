-- Add columns to existing musicians table for portal functionality
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS portal_invite_token TEXT;
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS portal_invite_sent_at TIMESTAMPTZ;
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS portal_invite_expires_at TIMESTAMPTZ;
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS portal_last_login TIMESTAMPTZ;
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN DEFAULT true;
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_musicians_user_id ON musicians(user_id);
CREATE INDEX IF NOT EXISTS idx_musicians_portal_invite_token ON musicians(portal_invite_token);
CREATE INDEX IF NOT EXISTS idx_musicians_email ON musicians(email);

-- Add comments for documentation
COMMENT ON COLUMN musicians.user_id IS 'Links musician to Supabase auth user for portal access';
COMMENT ON COLUMN musicians.portal_invite_token IS 'Token for activating portal access (expires after 7 days)';
COMMENT ON COLUMN musicians.portal_invite_sent_at IS 'When the portal invitation email was sent';
COMMENT ON COLUMN musicians.portal_invite_expires_at IS 'When the portal invitation token expires';
COMMENT ON COLUMN musicians.portal_last_login IS 'Last time musician logged into portal';
COMMENT ON COLUMN musicians.portal_enabled IS 'Whether this musician can access the portal';
COMMENT ON COLUMN musicians.profile_photo_url IS 'URL of musician profile photo';

-- Musician notification preferences table
CREATE TABLE IF NOT EXISTS musician_notification_preferences (
    musician_id UUID PRIMARY KEY REFERENCES musicians(id) ON DELETE CASCADE,
    email_new_offers BOOLEAN DEFAULT true,
    email_offer_reminders BOOLEAN DEFAULT true,
    email_schedule_changes BOOLEAN DEFAULT true,
    email_payment_updates BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comment for documentation
COMMENT ON TABLE musician_notification_preferences IS 'Per-musician notification preferences for portal users';

-- Trigger to update updated_at on musician_notification_preferences
CREATE OR REPLACE FUNCTION update_musician_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS musician_notification_preferences_updated_at ON musician_notification_preferences;
CREATE TRIGGER musician_notification_preferences_updated_at
    BEFORE UPDATE ON musician_notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_musician_notification_preferences_updated_at();

-- Enable RLS on musician_notification_preferences
ALTER TABLE musician_notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS policies for musician_notification_preferences
-- Musicians can view and update their own notification preferences
CREATE POLICY "Musicians can view own notification preferences"
    ON musician_notification_preferences FOR SELECT
    USING (
        musician_id IN (
            SELECT id FROM musicians WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Musicians can update own notification preferences"
    ON musician_notification_preferences FOR UPDATE
    USING (
        musician_id IN (
            SELECT id FROM musicians WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Musicians can insert own notification preferences"
    ON musician_notification_preferences FOR INSERT
    WITH CHECK (
        musician_id IN (
            SELECT id FROM musicians WHERE user_id = auth.uid()
        )
    );

-- Org admins can view notification preferences for their org's musicians
CREATE POLICY "Org admins can view musician notification preferences"
    ON musician_notification_preferences FOR SELECT
    USING (
        musician_id IN (
            SELECT m.id FROM musicians m
            JOIN organization_members om ON m.organization_id = om.organization_id
            WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
        )
    );

-- RLS policy updates for musicians table
-- Musicians can view their own records (linked by user_id)
CREATE POLICY "Musicians can view own musician records"
    ON musicians FOR SELECT
    USING (user_id = auth.uid());

-- Musicians can update limited fields on their own records
CREATE POLICY "Musicians can update own contact info"
    ON musicians FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Public access to musicians by portal invite token (for activation)
CREATE POLICY "Public can view musician by portal invite token"
    ON musicians FOR SELECT
    USING (
        portal_invite_token IS NOT NULL
        AND portal_invite_expires_at > NOW()
    );

-- Function to link musician records to user on registration
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
    WHERE email = p_email
    AND user_id IS NULL;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
