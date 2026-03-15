-- Saved reminder templates per organization
-- Org owners can save reusable note templates for pre-gig reminders
-- (e.g. parking instructions, dress code, load-in details)
CREATE TABLE reminder_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reminder_templates_org ON reminder_templates(organization_id);

-- RLS
ALTER TABLE reminder_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view reminder templates"
  ON reminder_templates FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Org admins can insert reminder templates"
  ON reminder_templates FOR INSERT
  WITH CHECK (is_org_admin(organization_id));

CREATE POLICY "Org admins can update reminder templates"
  ON reminder_templates FOR UPDATE
  USING (is_org_admin(organization_id));

CREATE POLICY "Org admins can delete reminder templates"
  ON reminder_templates FOR DELETE
  USING (is_org_admin(organization_id));
