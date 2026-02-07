-- Audit log for admin impersonation of musician portal views
CREATE TABLE impersonation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  musician_id UUID NOT NULL REFERENCES musicians(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_impersonation_log_org ON impersonation_log(organization_id);
CREATE INDEX idx_impersonation_log_admin ON impersonation_log(admin_user_id);

-- Enable RLS
ALTER TABLE impersonation_log ENABLE ROW LEVEL SECURITY;

-- Only org admins can view their org's impersonation logs
CREATE POLICY "Admins can view impersonation logs"
  ON impersonation_log FOR SELECT
  USING (is_org_admin(organization_id));

-- Any authenticated user can insert (the route validates admin status)
CREATE POLICY "Authenticated users can insert impersonation logs"
  ON impersonation_log FOR INSERT
  WITH CHECK (admin_user_id = auth.uid());
