-- Pre-gig reminder system: automated 48h reminder drafts for org owners
CREATE TABLE pre_gig_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'expired')),
  notes TEXT,
  trigger_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by UUID REFERENCES auth.users(id),
  sent_at TIMESTAMPTZ,
  musician_count INT,
  UNIQUE(project_id, trigger_date)
);

-- Indexes
CREATE INDEX idx_pre_gig_reminders_project ON pre_gig_reminders(project_id);
CREATE INDEX idx_pre_gig_reminders_org_status ON pre_gig_reminders(organization_id, status);

-- RLS
ALTER TABLE pre_gig_reminders ENABLE ROW LEVEL SECURITY;

-- Service role gets full access (handled automatically by Supabase)

-- Org members can view reminders for their org
CREATE POLICY "Org members can view pre-gig reminders"
  ON pre_gig_reminders FOR SELECT
  USING (is_org_member(organization_id));

-- Org admins can insert reminders
CREATE POLICY "Org admins can insert pre-gig reminders"
  ON pre_gig_reminders FOR INSERT
  WITH CHECK (is_org_admin(organization_id));

-- Org admins can update reminders (approve, add notes, expire)
CREATE POLICY "Org admins can update pre-gig reminders"
  ON pre_gig_reminders FOR UPDATE
  USING (is_org_admin(organization_id));
