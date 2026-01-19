-- Podium Personnel Database Schema
-- Multi-tenant SaaS platform for orchestra personnel management

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ORGANIZATIONS & MEMBERS
-- ============================================

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- ============================================
-- INSTRUMENTS
-- ============================================

CREATE TABLE instruments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  abbreviation VARCHAR(10),
  section VARCHAR(100), -- e.g., 'strings', 'woodwinds', 'brass', 'percussion'
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MUSICIANS
-- ============================================

CREATE TABLE musicians (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE musician_instruments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  musician_id UUID NOT NULL REFERENCES musicians(id) ON DELETE CASCADE,
  instrument_id UUID NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT FALSE,
  proficiency VARCHAR(50) DEFAULT 'professional',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(musician_id, instrument_id)
);

-- ============================================
-- BOOKS (Personnel Lists)
-- ============================================

CREATE TABLE books (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE book_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  musician_id UUID NOT NULL REFERENCES musicians(id) ON DELETE CASCADE,
  instrument_id UUID NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  chair_number INTEGER,
  priority INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(book_id, musician_id, instrument_id)
);

-- ============================================
-- PROJECTS & SERVICES
-- ============================================

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  start_date DATE,
  end_date DATE,
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  book_id UUID REFERENCES books(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  service_type VARCHAR(100) NOT NULL, -- e.g., 'rehearsal', 'performance', 'dress_rehearsal'
  venue VARCHAR(255),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PROJECT POSITIONS (Instrumentation)
-- ============================================

CREATE TABLE project_positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  instrument_id UUID NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  chair_number INTEGER NOT NULL,
  musician_id UUID REFERENCES musicians(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'vacant' CHECK (status IN ('vacant', 'offered', 'confirmed', 'declined')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, instrument_id, chair_number)
);

-- ============================================
-- CONTRACT OFFERS
-- ============================================

CREATE TABLE contract_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_position_id UUID NOT NULL REFERENCES project_positions(id) ON DELETE CASCADE,
  musician_id UUID NOT NULL REFERENCES musicians(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'viewed', 'accepted', 'declined', 'expired')),
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  response_notes TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SUBSTITUTION REQUESTS
-- ============================================

CREATE TABLE substitution_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_position_id UUID NOT NULL REFERENCES project_positions(id) ON DELETE CASCADE,
  requesting_musician_id UUID NOT NULL REFERENCES musicians(id) ON DELETE CASCADE,
  service_id UUID REFERENCES services(id) ON DELETE CASCADE, -- NULL means all services
  reason TEXT,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'filled')),
  substitute_musician_id UUID REFERENCES musicians(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- COMPETING SCHEDULES (for conflict detection)
-- ============================================

CREATE TABLE competing_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  musician_id UUID NOT NULL REFERENCES musicians(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX idx_organization_members_org ON organization_members(organization_id);
CREATE INDEX idx_organization_members_user ON organization_members(user_id);
CREATE INDEX idx_musicians_org ON musicians(organization_id);
CREATE INDEX idx_instruments_org ON instruments(organization_id);
CREATE INDEX idx_books_org ON books(organization_id);
CREATE INDEX idx_projects_org ON projects(organization_id);
CREATE INDEX idx_services_project ON services(project_id);
CREATE INDEX idx_project_positions_project ON project_positions(project_id);
CREATE INDEX idx_contract_offers_token ON contract_offers(token);
CREATE INDEX idx_contract_offers_position ON contract_offers(project_position_id);
CREATE INDEX idx_competing_schedules_musician ON competing_schedules(musician_id);
CREATE INDEX idx_competing_schedules_time ON competing_schedules(start_time, end_time);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE musicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE musician_instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE substitution_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE competing_schedules ENABLE ROW LEVEL SECURITY;

-- Helper function to check organization membership
CREATE OR REPLACE FUNCTION is_org_member(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id
    AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is org admin or owner
CREATE OR REPLACE FUNCTION is_org_admin(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Organizations policies
CREATE POLICY "Users can view their organizations"
  ON organizations FOR SELECT
  USING (is_org_member(id));

CREATE POLICY "Users can create organizations"
  ON organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can update their organizations"
  ON organizations FOR UPDATE
  USING (is_org_admin(id));

-- Organization members policies
CREATE POLICY "Users can view members of their organizations"
  ON organization_members FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Owners can manage members"
  ON organization_members FOR ALL
  USING (is_org_admin(organization_id));

CREATE POLICY "Users can join organizations"
  ON organization_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Musicians policies
CREATE POLICY "Users can view musicians in their organizations"
  ON musicians FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admins can manage musicians"
  ON musicians FOR ALL
  USING (is_org_admin(organization_id));

-- Instruments policies
CREATE POLICY "Users can view instruments in their organizations"
  ON instruments FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admins can manage instruments"
  ON instruments FOR ALL
  USING (is_org_admin(organization_id));

-- Musician instruments policies
CREATE POLICY "Users can view musician instruments"
  ON musician_instruments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM musicians m
      WHERE m.id = musician_id
      AND is_org_member(m.organization_id)
    )
  );

CREATE POLICY "Admins can manage musician instruments"
  ON musician_instruments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM musicians m
      WHERE m.id = musician_id
      AND is_org_admin(m.organization_id)
    )
  );

-- Books policies
CREATE POLICY "Users can view books in their organizations"
  ON books FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admins can manage books"
  ON books FOR ALL
  USING (is_org_admin(organization_id));

-- Book entries policies
CREATE POLICY "Users can view book entries"
  ON book_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM books b
      WHERE b.id = book_id
      AND is_org_member(b.organization_id)
    )
  );

CREATE POLICY "Admins can manage book entries"
  ON book_entries FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM books b
      WHERE b.id = book_id
      AND is_org_admin(b.organization_id)
    )
  );

-- Projects policies
CREATE POLICY "Users can view projects in their organizations"
  ON projects FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admins can manage projects"
  ON projects FOR ALL
  USING (is_org_admin(organization_id));

-- Services policies
CREATE POLICY "Users can view services"
  ON services FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_id
      AND is_org_member(p.organization_id)
    )
  );

CREATE POLICY "Admins can manage services"
  ON services FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_id
      AND is_org_admin(p.organization_id)
    )
  );

-- Project positions policies
CREATE POLICY "Users can view project positions"
  ON project_positions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_id
      AND is_org_member(p.organization_id)
    )
  );

CREATE POLICY "Admins can manage project positions"
  ON project_positions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_id
      AND is_org_admin(p.organization_id)
    )
  );

-- Contract offers policies (public access via token)
CREATE POLICY "Users can view contract offers in their organizations"
  ON contract_offers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_positions pp
      JOIN projects p ON p.id = pp.project_id
      WHERE pp.id = project_position_id
      AND is_org_member(p.organization_id)
    )
  );

CREATE POLICY "Public can view contract offers by token"
  ON contract_offers FOR SELECT
  USING (token IS NOT NULL);

CREATE POLICY "Public can update contract offers by token"
  ON contract_offers FOR UPDATE
  USING (token IS NOT NULL);

CREATE POLICY "Admins can manage contract offers"
  ON contract_offers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM project_positions pp
      JOIN projects p ON p.id = pp.project_id
      WHERE pp.id = project_position_id
      AND is_org_admin(p.organization_id)
    )
  );

-- Substitution requests policies
CREATE POLICY "Users can view substitution requests"
  ON substitution_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_positions pp
      JOIN projects p ON p.id = pp.project_id
      WHERE pp.id = project_position_id
      AND is_org_member(p.organization_id)
    )
  );

CREATE POLICY "Admins can manage substitution requests"
  ON substitution_requests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM project_positions pp
      JOIN projects p ON p.id = pp.project_id
      WHERE pp.id = project_position_id
      AND is_org_admin(p.organization_id)
    )
  );

-- Competing schedules policies
CREATE POLICY "Users can view competing schedules"
  ON competing_schedules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM musicians m
      WHERE m.id = musician_id
      AND is_org_member(m.organization_id)
    )
  );

CREATE POLICY "Admins can manage competing schedules"
  ON competing_schedules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM musicians m
      WHERE m.id = musician_id
      AND is_org_admin(m.organization_id)
    )
  );

-- ============================================
-- TRIGGERS FOR updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organization_members_updated_at
  BEFORE UPDATE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_instruments_updated_at
  BEFORE UPDATE ON instruments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_musicians_updated_at
  BEFORE UPDATE ON musicians
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_books_updated_at
  BEFORE UPDATE ON books
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_book_entries_updated_at
  BEFORE UPDATE ON book_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_services_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_positions_updated_at
  BEFORE UPDATE ON project_positions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contract_offers_updated_at
  BEFORE UPDATE ON contract_offers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_substitution_requests_updated_at
  BEFORE UPDATE ON substitution_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_competing_schedules_updated_at
  BEFORE UPDATE ON competing_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
