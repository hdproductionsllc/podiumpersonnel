-- Email audit log: track every email sent from the platform
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  email_type TEXT NOT NULL,  -- 'contract_offer', 'offer_reminder', 'offer_accepted', etc.
  musician_id UUID REFERENCES musicians(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  offer_id UUID REFERENCES contract_offers(id) ON DELETE SET NULL,
  resend_email_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  metadata JSONB DEFAULT '{}',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_logs_org ON email_logs(organization_id, sent_at DESC);
CREATE INDEX idx_email_logs_musician ON email_logs(musician_id);

-- RLS
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view email logs"
  ON email_logs FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Org admins can insert email logs"
  ON email_logs FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
