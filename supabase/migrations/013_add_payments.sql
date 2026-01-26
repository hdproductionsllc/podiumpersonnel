-- Create payments table for tracking musician payments per service
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- What's being paid for
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  musician_id UUID NOT NULL REFERENCES musicians(id) ON DELETE CASCADE,
  project_position_id UUID REFERENCES project_positions(id) ON DELETE SET NULL,

  -- Payment details
  amount DECIMAL(10,2) NOT NULL,
  is_leader_fee BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'pending', 'paid')),

  -- Payment metadata
  payment_date DATE,
  payment_method VARCHAR(50),
  payment_reference VARCHAR(255),
  notes TEXT,

  -- Export tracking
  exported_at TIMESTAMPTZ,
  export_batch_id VARCHAR(100),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- A musician can only have one base pay record and one leader fee record per service
  UNIQUE(service_id, musician_id, is_leader_fee)
);

-- Indexes for common queries
CREATE INDEX idx_payments_organization ON payments(organization_id);
CREATE INDEX idx_payments_service ON payments(service_id);
CREATE INDEX idx_payments_musician ON payments(musician_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_payment_date ON payments(payment_date);

-- Enable RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view payments in their organization"
  ON payments FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admins can insert payments"
  ON payments FOR INSERT
  WITH CHECK (is_org_admin(organization_id));

CREATE POLICY "Admins can update payments"
  ON payments FOR UPDATE
  USING (is_org_admin(organization_id));

CREATE POLICY "Admins can delete payments"
  ON payments FOR DELETE
  USING (is_org_admin(organization_id));

-- Trigger to update updated_at
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
