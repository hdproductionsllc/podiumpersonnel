-- Track gig detail email sends per project
CREATE TABLE gig_detail_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_by UUID NOT NULL REFERENCES auth.users(id),
  musician_count INT NOT NULL DEFAULT 0
);

-- Track per-musician confirmation of gig details
CREATE TABLE gig_detail_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  send_id UUID NOT NULL REFERENCES gig_detail_sends(id) ON DELETE CASCADE,
  musician_id UUID NOT NULL REFERENCES musicians(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  email_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  UNIQUE(send_id, musician_id)
);

CREATE INDEX idx_gig_detail_confirms_token ON gig_detail_confirmations(token);
CREATE INDEX idx_gig_detail_sends_project ON gig_detail_sends(project_id);

-- RLS
ALTER TABLE gig_detail_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE gig_detail_confirmations ENABLE ROW LEVEL SECURITY;

-- Service role bypass for API routes
CREATE POLICY "Service role full access to gig_detail_sends"
  ON gig_detail_sends FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to gig_detail_confirmations"
  ON gig_detail_confirmations FOR ALL
  USING (true)
  WITH CHECK (true);

-- Org members can view sends
CREATE POLICY "Org members can view gig detail sends"
  ON gig_detail_sends FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- Org admins can insert sends
CREATE POLICY "Org admins can insert gig detail sends"
  ON gig_detail_sends FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- Org members can view confirmations
CREATE POLICY "Org members can view gig detail confirmations"
  ON gig_detail_confirmations FOR SELECT
  USING (send_id IN (
    SELECT id FROM gig_detail_sends WHERE organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  ));
