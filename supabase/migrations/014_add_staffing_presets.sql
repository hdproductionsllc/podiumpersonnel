-- Create staffing_presets table for saving custom ensemble configurations
CREATE TABLE staffing_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  category VARCHAR(50) DEFAULT 'custom',

  -- Store positions as JSONB array: [{instrument_name, chair_number}]
  positions JSONB NOT NULL DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique name per organization
  UNIQUE(organization_id, name)
);

-- Indexes
CREATE INDEX idx_staffing_presets_organization ON staffing_presets(organization_id);
CREATE INDEX idx_staffing_presets_category ON staffing_presets(category);

-- Enable RLS
ALTER TABLE staffing_presets ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view presets in their organization"
  ON staffing_presets FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admins can insert presets"
  ON staffing_presets FOR INSERT
  WITH CHECK (is_org_admin(organization_id));

CREATE POLICY "Admins can update presets"
  ON staffing_presets FOR UPDATE
  USING (is_org_admin(organization_id));

CREATE POLICY "Admins can delete presets"
  ON staffing_presets FOR DELETE
  USING (is_org_admin(organization_id));

-- Trigger to update updated_at
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON staffing_presets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
