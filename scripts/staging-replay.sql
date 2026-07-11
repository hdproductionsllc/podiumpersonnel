-- STAGING REPLAY BUNDLE — generated 2026-07-11 from supabase/migrations/ (001-064)
-- Purpose: recreate the full Podium schema on a FRESH Supabase project (staging).
-- Run in the staging project's SQL editor. NEVER run against production.
-- If a statement fails, STOP and report the migration number + error.


-- ============================================================
-- 001_initial_schema.sql
-- ============================================================
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Organizations
create table organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Organization Members
create table organization_members (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, user_id)
);

-- Instruments
create table instruments (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  abbreviation text,
  section text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Musicians
create table musicians (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Musician Instruments (many-to-many)
create table musician_instruments (
  id uuid primary key default uuid_generate_v4(),
  musician_id uuid not null references musicians(id) on delete cascade,
  instrument_id uuid not null references instruments(id) on delete cascade,
  is_primary boolean not null default false,
  proficiency text not null default 'professional',
  created_at timestamptz not null default now(),
  unique(musician_id, instrument_id)
);

-- Books (seating charts)
create table books (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Book Entries (chair assignments)
create table book_entries (
  id uuid primary key default uuid_generate_v4(),
  book_id uuid not null references books(id) on delete cascade,
  musician_id uuid not null references musicians(id) on delete cascade,
  instrument_id uuid not null references instruments(id) on delete cascade,
  chair_number integer,
  priority integer not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Projects
create table projects (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  start_date date,
  end_date date,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'cancelled')),
  book_id uuid references books(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Services (rehearsals, performances)
create table services (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  service_type text not null,
  venue text,
  start_time timestamptz not null,
  end_time timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Project Positions
create table project_positions (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  instrument_id uuid not null references instruments(id) on delete cascade,
  chair_number integer not null,
  musician_id uuid references musicians(id) on delete set null,
  status text not null default 'vacant' check (status in ('vacant', 'offered', 'confirmed', 'declined')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Contract Offers
create table contract_offers (
  id uuid primary key default uuid_generate_v4(),
  project_position_id uuid not null references project_positions(id) on delete cascade,
  musician_id uuid not null references musicians(id) on delete cascade,
  token text not null unique default replace(uuid_generate_v4()::text, '-', ''),
  status text not null default 'pending' check (status in ('pending', 'viewed', 'accepted', 'declined', 'expired')),
  sent_at timestamptz,
  viewed_at timestamptz,
  responded_at timestamptz,
  response_notes text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Substitution Requests
create table substitution_requests (
  id uuid primary key default uuid_generate_v4(),
  project_position_id uuid not null references project_positions(id) on delete cascade,
  requesting_musician_id uuid not null references musicians(id) on delete cascade,
  service_id uuid references services(id) on delete set null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'filled')),
  substitute_musician_id uuid references musicians(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Competing Schedules
create table competing_schedules (
  id uuid primary key default uuid_generate_v4(),
  musician_id uuid not null references musicians(id) on delete cascade,
  title text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Helper functions for RLS
create or replace function is_org_member(org_id uuid)
returns boolean as $$
  select exists (
    select 1 from organization_members
    where organization_id = org_id
    and user_id = auth.uid()
  );
$$ language sql security definer;

create or replace function is_org_admin(org_id uuid)
returns boolean as $$
  select exists (
    select 1 from organization_members
    where organization_id = org_id
    and user_id = auth.uid()
    and role in ('owner', 'admin')
  );
$$ language sql security definer;

-- Enable RLS on all tables
alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table instruments enable row level security;
alter table musicians enable row level security;
alter table musician_instruments enable row level security;
alter table books enable row level security;
alter table book_entries enable row level security;
alter table projects enable row level security;
alter table services enable row level security;
alter table project_positions enable row level security;
alter table contract_offers enable row level security;
alter table substitution_requests enable row level security;
alter table competing_schedules enable row level security;

-- RLS Policies: Organizations
create policy "Members can view their organization"
  on organizations for select
  using (is_org_member(id));

create policy "Admins can update their organization"
  on organizations for update
  using (is_org_admin(id));

-- RLS Policies: Organization Members
create policy "Members can view org members"
  on organization_members for select
  using (is_org_member(organization_id));

create policy "Users can insert their own membership"
  on organization_members for insert
  with check (user_id = auth.uid());

-- RLS Policies: Instruments
create policy "Members can view instruments"
  on instruments for select
  using (is_org_member(organization_id));

create policy "Admins can manage instruments"
  on instruments for all
  using (is_org_admin(organization_id));

-- RLS Policies: Musicians
create policy "Members can view musicians"
  on musicians for select
  using (is_org_member(organization_id));

create policy "Admins can manage musicians"
  on musicians for all
  using (is_org_admin(organization_id));

-- RLS Policies: Musician Instruments
create policy "Members can view musician instruments"
  on musician_instruments for select
  using (
    exists (
      select 1 from musicians m
      where m.id = musician_id
      and is_org_member(m.organization_id)
    )
  );

create policy "Admins can manage musician instruments"
  on musician_instruments for all
  using (
    exists (
      select 1 from musicians m
      where m.id = musician_id
      and is_org_admin(m.organization_id)
    )
  );

-- RLS Policies: Books
create policy "Members can view books"
  on books for select
  using (is_org_member(organization_id));

create policy "Admins can manage books"
  on books for all
  using (is_org_admin(organization_id));

-- RLS Policies: Book Entries
create policy "Members can view book entries"
  on book_entries for select
  using (
    exists (
      select 1 from books b
      where b.id = book_id
      and is_org_member(b.organization_id)
    )
  );

create policy "Admins can manage book entries"
  on book_entries for all
  using (
    exists (
      select 1 from books b
      where b.id = book_id
      and is_org_admin(b.organization_id)
    )
  );

-- RLS Policies: Projects
create policy "Members can view projects"
  on projects for select
  using (is_org_member(organization_id));

create policy "Admins can manage projects"
  on projects for all
  using (is_org_admin(organization_id));

-- RLS Policies: Services
create policy "Members can view services"
  on services for select
  using (
    exists (
      select 1 from projects p
      where p.id = project_id
      and is_org_member(p.organization_id)
    )
  );

create policy "Admins can manage services"
  on services for all
  using (
    exists (
      select 1 from projects p
      where p.id = project_id
      and is_org_admin(p.organization_id)
    )
  );

-- RLS Policies: Project Positions
create policy "Members can view project positions"
  on project_positions for select
  using (
    exists (
      select 1 from projects p
      where p.id = project_id
      and is_org_member(p.organization_id)
    )
  );

create policy "Admins can manage project positions"
  on project_positions for all
  using (
    exists (
      select 1 from projects p
      where p.id = project_id
      and is_org_admin(p.organization_id)
    )
  );

-- RLS Policies: Contract Offers
create policy "Members can view contract offers"
  on contract_offers for select
  using (
    exists (
      select 1 from project_positions pp
      join projects p on p.id = pp.project_id
      where pp.id = project_position_id
      and is_org_member(p.organization_id)
    )
  );

create policy "Admins can manage contract offers"
  on contract_offers for all
  using (
    exists (
      select 1 from project_positions pp
      join projects p on p.id = pp.project_id
      where pp.id = project_position_id
      and is_org_admin(p.organization_id)
    )
  );

create policy "Public can view contract offers by token"
  on contract_offers for select
  using (true);

create policy "Public can update contract offers by token"
  on contract_offers for update
  using (true);

-- RLS Policies: Substitution Requests
create policy "Members can view substitution requests"
  on substitution_requests for select
  using (
    exists (
      select 1 from project_positions pp
      join projects p on p.id = pp.project_id
      where pp.id = project_position_id
      and is_org_member(p.organization_id)
    )
  );

create policy "Admins can manage substitution requests"
  on substitution_requests for all
  using (
    exists (
      select 1 from project_positions pp
      join projects p on p.id = pp.project_id
      where pp.id = project_position_id
      and is_org_admin(p.organization_id)
    )
  );

-- RLS Policies: Competing Schedules
create policy "Members can view competing schedules"
  on competing_schedules for select
  using (
    exists (
      select 1 from musicians m
      where m.id = musician_id
      and is_org_member(m.organization_id)
    )
  );

create policy "Admins can manage competing schedules"
  on competing_schedules for all
  using (
    exists (
      select 1 from musicians m
      where m.id = musician_id
      and is_org_admin(m.organization_id)
    )
  );

-- Updated_at trigger function
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply updated_at triggers
create trigger set_updated_at before update on organizations for each row execute function update_updated_at();
create trigger set_updated_at before update on organization_members for each row execute function update_updated_at();
create trigger set_updated_at before update on instruments for each row execute function update_updated_at();
create trigger set_updated_at before update on musicians for each row execute function update_updated_at();
create trigger set_updated_at before update on books for each row execute function update_updated_at();
create trigger set_updated_at before update on book_entries for each row execute function update_updated_at();
create trigger set_updated_at before update on projects for each row execute function update_updated_at();
create trigger set_updated_at before update on services for each row execute function update_updated_at();
create trigger set_updated_at before update on project_positions for each row execute function update_updated_at();
create trigger set_updated_at before update on contract_offers for each row execute function update_updated_at();
create trigger set_updated_at before update on substitution_requests for each row execute function update_updated_at();
create trigger set_updated_at before update on competing_schedules for each row execute function update_updated_at();


-- ============================================================
-- 002_add_musician_tags.sql
-- ============================================================
-- Add tags array column to musicians for ensemble/region labeling
alter table musicians add column tags text[] default '{}';

-- Create index for faster tag filtering
create index idx_musicians_tags on musicians using gin(tags);


-- ============================================================
-- 003_add_venues.sql
-- ============================================================
-- Create venues table for reusable venue information
create table venues (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  address text,
  city text,
  state text,
  zip text,
  google_place_id text,
  google_maps_url text,
  parking_info text,
  directions text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for organization lookup
create index idx_venues_organization on venues(organization_id);

-- Add venue_id to services table
alter table services add column venue_id uuid references venues(id) on delete set null;

-- Enable RLS
alter table venues enable row level security;

-- RLS policies for venues
create policy "Users can view venues in their organization"
  on venues for select
  using (
    organization_id in (
      select organization_id from organization_members where user_id = auth.uid()
    )
  );

create policy "Admins can insert venues"
  on venues for insert
  with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "Admins can update venues"
  on venues for update
  using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "Admins can delete venues"
  on venues for delete
  using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );


-- ============================================================
-- 004_musician_service_area.sql
-- ============================================================
-- Add service area and call order fields to musicians
ALTER TABLE musicians ADD COLUMN zip_code VARCHAR(10);
ALTER TABLE musicians ADD COLUMN service_radius_miles INTEGER DEFAULT 50;
ALTER TABLE musicians ADD COLUMN call_order INTEGER DEFAULT 100;
ALTER TABLE musicians ADD COLUMN is_leader BOOLEAN DEFAULT FALSE;

-- Index for efficient call order queries
CREATE INDEX idx_musicians_call_order ON musicians(organization_id, call_order);
CREATE INDEX idx_musicians_zip ON musicians(zip_code) WHERE zip_code IS NOT NULL;


-- ============================================================
-- 005_pay_system.sql
-- ============================================================
-- Add pay fields to services
ALTER TABLE services ADD COLUMN base_pay DECIMAL(10,2);
ALTER TABLE services ADD COLUMN leader_fee DECIMAL(10,2) DEFAULT 50.00;

-- Add custom pay override to contract offers
ALTER TABLE contract_offers ADD COLUMN custom_pay DECIMAL(10,2);


-- ============================================================
-- 006_zip_coordinates.sql
-- ============================================================
-- Zip code coordinates for distance calculation
-- This table will be populated with US zip code data
CREATE TABLE zip_coordinates (
  zip VARCHAR(10) PRIMARY KEY,
  lat DECIMAL(9,6) NOT NULL,
  lng DECIMAL(9,6) NOT NULL
);

-- Common California zip codes for initial testing
-- Full dataset should be imported from public US zip code data
INSERT INTO zip_coordinates (zip, lat, lng) VALUES
  -- Los Angeles area
  ('90210', 34.0901, -118.4065),  -- Beverly Hills
  ('90001', 33.9425, -118.2551),  -- Los Angeles
  ('90012', 34.0622, -118.2428),  -- Downtown LA
  ('90028', 34.1016, -118.3267),  -- Hollywood
  ('90291', 33.9925, -118.4695),  -- Venice
  ('90401', 34.0195, -118.4912),  -- Santa Monica
  ('91101', 34.1478, -118.1445),  -- Pasadena
  ('91301', 34.1361, -118.7598),  -- Agoura Hills
  ('91302', 34.1478, -118.6298),  -- Calabasas
  ('91364', 34.1581, -118.5590),  -- Woodland Hills
  ('91401', 34.1826, -118.4490),  -- Van Nuys
  ('91505', 34.1808, -118.3090),  -- Burbank
  ('91601', 34.1670, -118.3760),  -- North Hollywood
  -- Orange County
  ('92602', 33.7175, -117.7950),  -- Irvine
  ('92801', 33.8366, -117.9143),  -- Anaheim
  ('92660', 33.6189, -117.9298),  -- Newport Beach
  -- San Diego area
  ('92101', 32.7195, -117.1628),  -- San Diego Downtown
  ('92037', 32.8328, -117.2713),  -- La Jolla
  -- Santa Barbara
  ('93101', 34.4208, -119.6982),  -- Santa Barbara
  ('93103', 34.4358, -119.7143),  -- Santa Barbara
  -- Palm Springs area
  ('92262', 33.8303, -116.5453),  -- Palm Springs
  ('92264', 33.7872, -116.4958),  -- Palm Springs
  -- Ventura County
  ('93001', 34.2805, -119.2945),  -- Ventura
  ('91320', 34.1789, -118.8765),  -- Newbury Park
  ('91360', 34.1956, -118.8756),  -- Thousand Oaks
  -- Central Coast
  ('93401', 35.2828, -120.6596),  -- San Luis Obispo
  -- Bay Area (for future expansion)
  ('94102', 37.7749, -122.4194),  -- San Francisco
  ('94301', 37.4419, -122.1430),  -- Palo Alto
  ('95101', 37.3382, -121.8863);  -- San Jose


-- ============================================================
-- 007_add_home_region.sql
-- ============================================================
-- Add home_region column to musicians table
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS home_region VARCHAR(100);

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_musicians_home_region ON musicians(home_region);


-- ============================================================
-- 008_add_w9_on_file.sql
-- ============================================================
-- Add W-9 on file tracking for musicians
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS w9_on_file BOOLEAN DEFAULT FALSE;

-- Index for filtering musicians by W-9 status
CREATE INDEX IF NOT EXISTS idx_musicians_w9_on_file ON musicians(organization_id, w9_on_file);


-- ============================================================
-- 009_add_zelle_payment.sql
-- ============================================================
-- Add Zelle payment tracking for musicians
-- zelle_method: 'email' or 'phone' - which contact to use for Zelle
-- zelle_verified: whether payment info has been confirmed with the musician

ALTER TABLE musicians ADD COLUMN IF NOT EXISTS zelle_method VARCHAR(10) CHECK (zelle_method IN ('email', 'phone'));
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS zelle_verified BOOLEAN DEFAULT FALSE;

-- Index for filtering musicians by payment status
CREATE INDEX IF NOT EXISTS idx_musicians_zelle ON musicians(organization_id, zelle_method, zelle_verified);


-- ============================================================
-- 010_add_musician_policy.sql
-- ============================================================
-- Add musician_policy field to organizations for customizable policy text
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS musician_policy text;


-- ============================================================
-- 011_add_organization_timezone.sql
-- ============================================================
-- Add timezone column to organizations
ALTER TABLE organizations
ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles';

-- Add comment for documentation
COMMENT ON COLUMN organizations.timezone IS 'IANA timezone identifier for the organization (e.g., America/Los_Angeles, America/New_York)';


-- ============================================================
-- 012_enhanced_substitution_requests.sql
-- ============================================================
-- Enhanced substitution requests for musician-driven workflow
-- Allows musicians to suggest their own subs with contact info

-- Add new columns for suggested sub info
ALTER TABLE substitution_requests
ADD COLUMN IF NOT EXISTS suggested_sub_name TEXT,
ADD COLUMN IF NOT EXISTS suggested_sub_email TEXT,
ADD COLUMN IF NOT EXISTS suggested_sub_phone TEXT,
ADD COLUMN IF NOT EXISTS suggested_sub_instrument_id UUID REFERENCES instruments(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS admin_notes TEXT,
ADD COLUMN IF NOT EXISTS offer_id UUID REFERENCES contract_offers(id) ON DELETE SET NULL;

-- Drop old status constraint and add new one with expanded statuses
ALTER TABLE substitution_requests
DROP CONSTRAINT IF EXISTS substitution_requests_status_check;

ALTER TABLE substitution_requests
ADD CONSTRAINT substitution_requests_status_check
CHECK (status IN ('pending_approval', 'approved', 'declined', 'sub_declined', 'filled', 'cancelled', 'pending', 'denied'));
-- Note: 'pending' and 'denied' kept for backwards compatibility with existing data

-- Add index for looking up substitution requests by offer
CREATE INDEX IF NOT EXISTS idx_substitution_requests_offer_id ON substitution_requests(offer_id);


-- ============================================================
-- 013_add_payments.sql
-- ============================================================
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


-- ============================================================
-- 014_add_staffing_presets.sql
-- ============================================================
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


-- ============================================================
-- 015_add_email_branding.sql
-- ============================================================
-- Add email branding fields to organizations table
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS email_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS email_brand_color VARCHAR(7) DEFAULT '#3b82f6',
  ADD COLUMN IF NOT EXISTS email_footer_text TEXT;

-- Add comment for documentation
COMMENT ON COLUMN organizations.email_logo_url IS 'URL of the logo to display in email headers';
COMMENT ON COLUMN organizations.email_brand_color IS 'Hex color code for email buttons and accents (e.g., #3b82f6)';
COMMENT ON COLUMN organizations.email_footer_text IS 'Custom footer text for emails';


-- ============================================================
-- 016_add_musician_portal.sql
-- ============================================================
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


-- ============================================================
-- 017_fix_portal_activation_and_rls.sql
-- ============================================================
-- Fix #1: Add SECURITY DEFINER function for token-based activation
-- The direct client update was blocked by RLS because user_id is NULL during activation
CREATE OR REPLACE FUNCTION activate_musician_by_token(p_user_id UUID, p_token TEXT)
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE musicians
    SET user_id = p_user_id,
        portal_invite_token = NULL,
        portal_invite_sent_at = NULL,
        portal_invite_expires_at = NULL
    WHERE portal_invite_token = p_token
    AND user_id IS NULL;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix #2: Add SECURITY DEFINER function for token lookup and drop the overly-broad SELECT policy.
-- The old policy granted SELECT to ALL musicians with any active invite token,
-- not just the one matching the request. This replaces it with a scoped function.
CREATE OR REPLACE FUNCTION get_musician_by_invite_token(p_token TEXT)
RETURNS TABLE(
    id UUID,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    portal_invite_expires_at TIMESTAMPTZ,
    user_id UUID,
    organization_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.first_name,
        m.last_name,
        m.email,
        m.portal_invite_expires_at,
        m.user_id,
        o.name AS organization_name
    FROM musicians m
    JOIN organizations o ON m.organization_id = o.id
    WHERE m.portal_invite_token = p_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the overly-broad SELECT policy
DROP POLICY IF EXISTS "Public can view musician by portal invite token" ON musicians;


-- ============================================================
-- 018_allow_org_creation.sql
-- ============================================================
-- Allow authenticated users to create organizations (needed for onboarding)
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON organizations;
CREATE POLICY "Authenticated users can create organizations"
  on organizations for insert
  with check (auth.uid() is not null);


-- ============================================================
-- 019_fix_onboarding_and_rls_gaps.sql
-- ============================================================
-- 1. SECURITY DEFINER function for onboarding: atomically creates an organization
--    and adds the current user as owner, avoiding the SELECT-after-INSERT RLS issue.
CREATE OR REPLACE FUNCTION create_organization_with_owner(
  p_name TEXT,
  p_slug TEXT,
  p_timezone TEXT
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_final_slug TEXT := p_slug;
  v_existing UUID;
BEGIN
  -- Get the authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Ensure slug is unique
  SELECT id INTO v_existing FROM organizations WHERE slug = v_final_slug;
  IF v_existing IS NOT NULL THEN
    v_final_slug := v_final_slug || '-' || substr(md5(random()::text), 1, 4);
  END IF;

  -- Create the organization
  INSERT INTO organizations (name, slug, timezone)
  VALUES (p_name, v_final_slug, p_timezone)
  RETURNING id INTO v_org_id;

  -- Add the user as owner
  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (v_org_id, v_user_id, 'owner');

  -- Return the created organization
  RETURN json_build_object(
    'id', v_org_id,
    'name', p_name,
    'slug', v_final_slug,
    'timezone', p_timezone
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Add missing management policy for organization_members (UPDATE/DELETE for admins)
CREATE POLICY "Admins can manage organization members"
  ON organization_members FOR ALL
  USING (is_org_admin(organization_id));

-- 3. Drop overly-broad contract_offers public policies (using(true) exposes all rows).
--    The gig routes now use the service role client which bypasses RLS.
DROP POLICY IF EXISTS "Public can view contract offers by token" ON contract_offers;
DROP POLICY IF EXISTS "Public can update contract offers by token" ON contract_offers;


-- ============================================================
-- 020_auto_populate_instruments.sql
-- ============================================================
-- Replace create_organization_with_owner to auto-populate standard instruments
CREATE OR REPLACE FUNCTION create_organization_with_owner(
  p_name TEXT,
  p_slug TEXT,
  p_timezone TEXT
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_final_slug TEXT := p_slug;
  v_existing UUID;
BEGIN
  -- Get the authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Ensure slug is unique
  SELECT id INTO v_existing FROM organizations WHERE slug = v_final_slug;
  IF v_existing IS NOT NULL THEN
    v_final_slug := v_final_slug || '-' || substr(md5(random()::text), 1, 4);
  END IF;

  -- Create the organization
  INSERT INTO organizations (name, slug, timezone)
  VALUES (p_name, v_final_slug, p_timezone)
  RETURNING id INTO v_org_id;

  -- Add the user as owner
  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (v_org_id, v_user_id, 'owner');

  -- Auto-populate standard instruments
  INSERT INTO instruments (organization_id, name, abbreviation, section, sort_order) VALUES
    -- Strings
    (v_org_id, 'Violin 1', 'Vln 1', 'strings', 1),
    (v_org_id, 'Violin 2', 'Vln 2', 'strings', 2),
    (v_org_id, 'Viola', 'Vla', 'strings', 3),
    (v_org_id, 'Cello', 'Vc', 'strings', 4),
    (v_org_id, 'Double Bass', 'Db', 'strings', 5),
    (v_org_id, 'Harp', 'Hp', 'strings', 6),
    (v_org_id, 'Guitar', 'Gtr', 'strings', 7),
    (v_org_id, 'Bass Guitar', 'Bass', 'strings', 8),
    (v_org_id, 'Mandolin', 'Mand', 'strings', 9),
    -- Woodwinds
    (v_org_id, 'Flute', 'Fl', 'woodwinds', 10),
    (v_org_id, 'Piccolo', 'Picc', 'woodwinds', 11),
    (v_org_id, 'Alto Flute', 'AFl', 'woodwinds', 12),
    (v_org_id, 'Oboe', 'Ob', 'woodwinds', 13),
    (v_org_id, 'English Horn', 'EH', 'woodwinds', 14),
    (v_org_id, 'Clarinet', 'Cl', 'woodwinds', 15),
    (v_org_id, 'Eb Clarinet', 'EbCl', 'woodwinds', 16),
    (v_org_id, 'Bass Clarinet', 'BCl', 'woodwinds', 17),
    (v_org_id, 'Bassoon', 'Bsn', 'woodwinds', 18),
    (v_org_id, 'Contrabassoon', 'Cbsn', 'woodwinds', 19),
    (v_org_id, 'Alto Saxophone', 'ASax', 'woodwinds', 20),
    (v_org_id, 'Tenor Saxophone', 'TSax', 'woodwinds', 21),
    (v_org_id, 'Baritone Saxophone', 'BSax', 'woodwinds', 22),
    (v_org_id, 'Soprano Saxophone', 'SSax', 'woodwinds', 23),
    (v_org_id, 'Recorder', 'Rec', 'woodwinds', 24),
    -- Brass
    (v_org_id, 'French Horn', 'Hn', 'brass', 30),
    (v_org_id, 'Trumpet', 'Tpt', 'brass', 31),
    (v_org_id, 'Cornet', 'Cnt', 'brass', 32),
    (v_org_id, 'Flugelhorn', 'Flug', 'brass', 33),
    (v_org_id, 'Trombone', 'Tbn', 'brass', 34),
    (v_org_id, 'Bass Trombone', 'BTbn', 'brass', 35),
    (v_org_id, 'Euphonium', 'Euph', 'brass', 36),
    (v_org_id, 'Tuba', 'Tba', 'brass', 37),
    -- Percussion
    (v_org_id, 'Timpani', 'Timp', 'percussion', 40),
    (v_org_id, 'Percussion', 'Perc', 'percussion', 41),
    (v_org_id, 'Snare Drum', 'SD', 'percussion', 42),
    (v_org_id, 'Bass Drum', 'BD', 'percussion', 43),
    (v_org_id, 'Cymbals', 'Cym', 'percussion', 44),
    (v_org_id, 'Vibraphone', 'Vib', 'percussion', 45),
    (v_org_id, 'Marimba', 'Mar', 'percussion', 46),
    (v_org_id, 'Xylophone', 'Xyl', 'percussion', 47),
    (v_org_id, 'Glockenspiel', 'Glock', 'percussion', 48),
    (v_org_id, 'Chimes', 'Chm', 'percussion', 49),
    (v_org_id, 'Drum Set', 'Drums', 'percussion', 50),
    -- Other
    (v_org_id, 'Piano', 'Pno', 'other', 60),
    (v_org_id, 'Keyboard', 'Kbd', 'other', 61),
    (v_org_id, 'Celesta', 'Cel', 'other', 62),
    (v_org_id, 'Organ', 'Org', 'other', 63),
    (v_org_id, 'Harpsichord', 'Hpd', 'other', 64),
    (v_org_id, 'Synthesizer', 'Synth', 'other', 65),
    (v_org_id, 'Accordion', 'Acc', 'other', 66),
    (v_org_id, 'Voice - Soprano', 'Sop', 'other', 70),
    (v_org_id, 'Voice - Alto', 'Alto', 'other', 71),
    (v_org_id, 'Voice - Tenor', 'Ten', 'other', 72),
    (v_org_id, 'Voice - Baritone', 'Bar', 'other', 73),
    (v_org_id, 'Voice - Bass', 'Bas', 'other', 74),
    (v_org_id, 'Conductor', 'Cond', 'other', 80),
    (v_org_id, 'Music Librarian', 'Lib', 'other', 81);

  -- Return the created organization
  RETURN json_build_object(
    'id', v_org_id,
    'name', p_name,
    'slug', v_final_slug,
    'timezone', p_timezone
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 021_add_call_time.sql
-- ============================================================
-- Add call_time column to services table
-- Call time is when musicians should arrive, distinct from start_time (performance/rehearsal start)
ALTER TABLE services ADD COLUMN call_time timestamptz;


-- ============================================================
-- 022_add_tutorial_state.sql
-- ============================================================
-- Tutorial state tracking for user onboarding
CREATE TABLE user_tutorial_state (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  wizard_completed BOOLEAN DEFAULT FALSE,
  wizard_step INTEGER DEFAULT 0,
  dismissed_tooltips TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, organization_id)
);

-- RLS policies
ALTER TABLE user_tutorial_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tutorial state"
  ON user_tutorial_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tutorial state"
  ON user_tutorial_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tutorial state"
  ON user_tutorial_state FOR UPDATE
  USING (auth.uid() = user_id);


-- ============================================================
-- 023_add_internal_notes.sql
-- ============================================================
ALTER TABLE projects ADD COLUMN IF NOT EXISTS internal_notes text;


-- ============================================================
-- 024_add_personal_message.sql
-- ============================================================
-- Add personal message column to contract_offers
ALTER TABLE contract_offers ADD COLUMN IF NOT EXISTS personal_message text;


-- ============================================================
-- 025_add_service_time_constraints.sql
-- ============================================================
-- Ensure call_time is always before or equal to start_time
-- Call time is when musicians arrive; start_time is when the event begins
ALTER TABLE services
ADD CONSTRAINT services_call_time_before_start
CHECK (call_time IS NULL OR call_time <= start_time);


-- ============================================================
-- 026_normalize_sub_request_status.sql
-- ============================================================
-- Normalize substitution request statuses
-- Merge legacy 'pending' → 'pending_approval' and 'denied' → 'declined'

-- Step 1: Migrate any existing data using old status values
UPDATE substitution_requests SET status = 'pending_approval' WHERE status = 'pending';
UPDATE substitution_requests SET status = 'declined' WHERE status = 'denied';

-- Step 2: Drop old constraint that includes legacy values
ALTER TABLE substitution_requests
DROP CONSTRAINT IF EXISTS substitution_requests_status_check;

-- Step 3: Add clean constraint with exactly 6 canonical values
ALTER TABLE substitution_requests
ADD CONSTRAINT substitution_requests_status_check
CHECK (status IN ('pending_approval', 'approved', 'declined', 'sub_declined', 'filled', 'cancelled'));


-- ============================================================
-- 027_relax_payment_unique_constraint.sql
-- ============================================================
-- Add payment_type column to distinguish standard payments from adjustments/corrections
-- This allows multiple payment records per musician per service (e.g. a correction after the original)
ALTER TABLE payments
ADD COLUMN payment_type VARCHAR(20) NOT NULL DEFAULT 'standard'
CHECK (payment_type IN ('standard', 'adjustment', 'correction', 'bonus'));

-- Drop the old unique constraint that prevented corrections
ALTER TABLE payments
DROP CONSTRAINT IF EXISTS payments_service_id_musician_id_is_leader_fee_key;

-- Add a partial unique index: only one "standard" payment per musician/service/leader combo
CREATE UNIQUE INDEX payments_standard_unique
ON payments (service_id, musician_id, is_leader_fee)
WHERE payment_type = 'standard';


-- ============================================================
-- 028_add_impersonation_log.sql
-- ============================================================
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


-- ============================================================
-- 029_expand_standard_instruments.sql
-- ============================================================
-- Expand standard instrument library with commonly-needed orchestral instruments
-- Adds 16 new instruments and renumbers sort_order for better spacing

-- 1. Add missing instruments to ALL existing organizations
INSERT INTO instruments (organization_id, name, abbreviation, section, sort_order)
SELECT o.id, v.name, v.abbreviation, v.section::text, v.sort_order
FROM organizations o
CROSS JOIN (VALUES
  -- Strings
  ('Electric Guitar', 'EGtr', 'strings', 107),
  ('Banjo', 'Bnj', 'strings', 109),
  -- Woodwinds
  ('Bass Flute', 'BFl', 'woodwinds', 203),
  ('Oboe d''Amore', 'OdA', 'woodwinds', 205),
  ('Clarinet in A', 'Cl(A)', 'woodwinds', 208),
  ('Contrabass Clarinet', 'CbCl', 'woodwinds', 211),
  -- Brass
  ('Piccolo Trumpet', 'PicTpt', 'brass', 302),
  ('Alto Trombone', 'ATbn', 'brass', 306),
  ('Bass Trumpet', 'BTpt', 'brass', 308),
  ('Wagner Tuba', 'WTba', 'brass', 311),
  -- Percussion
  ('Tam-tam', 'TT', 'percussion', 405),
  ('Triangle', 'Tri', 'percussion', 406),
  ('Tambourine', 'Tamb', 'percussion', 407),
  ('Crotales', 'Crot', 'percussion', 408),
  -- Voices
  ('Voice - Mezzo-Soprano', 'Mez', 'other', 601),
  ('Voice - Countertenor', 'CTen', 'other', 603)
) AS v(name, abbreviation, section, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM instruments i
  WHERE i.organization_id = o.id AND i.name = v.name
);

-- 2. Update sort_order for existing instruments to use new spacing scheme
-- This ensures consistent ordering across old and new instruments
UPDATE instruments SET sort_order = CASE name
  -- Strings
  WHEN 'Violin 1' THEN 100
  WHEN 'Violin 2' THEN 101
  WHEN 'Viola' THEN 102
  WHEN 'Cello' THEN 103
  WHEN 'Double Bass' THEN 104
  WHEN 'Harp' THEN 105
  WHEN 'Guitar' THEN 106
  WHEN 'Electric Guitar' THEN 107
  WHEN 'Bass Guitar' THEN 108
  WHEN 'Banjo' THEN 109
  WHEN 'Mandolin' THEN 110
  -- Woodwinds
  WHEN 'Flute' THEN 200
  WHEN 'Piccolo' THEN 201
  WHEN 'Alto Flute' THEN 202
  WHEN 'Bass Flute' THEN 203
  WHEN 'Oboe' THEN 204
  WHEN 'Oboe d''Amore' THEN 205
  WHEN 'English Horn' THEN 206
  WHEN 'Clarinet' THEN 207
  WHEN 'Clarinet in A' THEN 208
  WHEN 'Eb Clarinet' THEN 209
  WHEN 'Bass Clarinet' THEN 210
  WHEN 'Contrabass Clarinet' THEN 211
  WHEN 'Bassoon' THEN 212
  WHEN 'Contrabassoon' THEN 213
  WHEN 'Soprano Saxophone' THEN 214
  WHEN 'Alto Saxophone' THEN 215
  WHEN 'Tenor Saxophone' THEN 216
  WHEN 'Baritone Saxophone' THEN 217
  WHEN 'Recorder' THEN 218
  -- Brass
  WHEN 'French Horn' THEN 300
  WHEN 'Trumpet' THEN 301
  WHEN 'Piccolo Trumpet' THEN 302
  WHEN 'Cornet' THEN 303
  WHEN 'Flugelhorn' THEN 304
  WHEN 'Trombone' THEN 305
  WHEN 'Alto Trombone' THEN 306
  WHEN 'Bass Trombone' THEN 307
  WHEN 'Bass Trumpet' THEN 308
  WHEN 'Euphonium' THEN 309
  WHEN 'Tuba' THEN 310
  WHEN 'Wagner Tuba' THEN 311
  -- Percussion
  WHEN 'Timpani' THEN 400
  WHEN 'Percussion' THEN 401
  WHEN 'Snare Drum' THEN 402
  WHEN 'Bass Drum' THEN 403
  WHEN 'Cymbals' THEN 404
  WHEN 'Tam-tam' THEN 405
  WHEN 'Triangle' THEN 406
  WHEN 'Tambourine' THEN 407
  WHEN 'Crotales' THEN 408
  WHEN 'Vibraphone' THEN 409
  WHEN 'Marimba' THEN 410
  WHEN 'Xylophone' THEN 411
  WHEN 'Glockenspiel' THEN 412
  WHEN 'Chimes' THEN 413
  WHEN 'Drum Set' THEN 414
  -- Keyboards
  WHEN 'Piano' THEN 500
  WHEN 'Keyboard' THEN 501
  WHEN 'Celesta' THEN 502
  WHEN 'Organ' THEN 503
  WHEN 'Harpsichord' THEN 504
  WHEN 'Synthesizer' THEN 505
  WHEN 'Accordion' THEN 506
  -- Voices
  WHEN 'Voice - Soprano' THEN 600
  WHEN 'Voice - Mezzo-Soprano' THEN 601
  WHEN 'Voice - Alto' THEN 602
  WHEN 'Voice - Countertenor' THEN 603
  WHEN 'Voice - Tenor' THEN 604
  WHEN 'Voice - Baritone' THEN 605
  WHEN 'Voice - Bass' THEN 606
  -- Staff
  WHEN 'Conductor' THEN 700
  WHEN 'Music Librarian' THEN 701
  ELSE sort_order
END;

-- 3. Replace the organization creation function with the expanded instrument list
CREATE OR REPLACE FUNCTION create_organization_with_owner(
  p_name TEXT,
  p_slug TEXT,
  p_timezone TEXT
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_final_slug TEXT := p_slug;
  v_existing UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_existing FROM organizations WHERE slug = v_final_slug;
  IF v_existing IS NOT NULL THEN
    v_final_slug := v_final_slug || '-' || substr(md5(random()::text), 1, 4);
  END IF;

  INSERT INTO organizations (name, slug, timezone)
  VALUES (p_name, v_final_slug, p_timezone)
  RETURNING id INTO v_org_id;

  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (v_org_id, v_user_id, 'owner');

  -- Auto-populate standard instruments (64 instruments)
  INSERT INTO instruments (organization_id, name, abbreviation, section, sort_order) VALUES
    -- Strings
    (v_org_id, 'Violin 1', 'Vln 1', 'strings', 100),
    (v_org_id, 'Violin 2', 'Vln 2', 'strings', 101),
    (v_org_id, 'Viola', 'Vla', 'strings', 102),
    (v_org_id, 'Cello', 'Vc', 'strings', 103),
    (v_org_id, 'Double Bass', 'Db', 'strings', 104),
    (v_org_id, 'Harp', 'Hp', 'strings', 105),
    (v_org_id, 'Guitar', 'Gtr', 'strings', 106),
    (v_org_id, 'Electric Guitar', 'EGtr', 'strings', 107),
    (v_org_id, 'Bass Guitar', 'Bass', 'strings', 108),
    (v_org_id, 'Banjo', 'Bnj', 'strings', 109),
    (v_org_id, 'Mandolin', 'Mand', 'strings', 110),
    -- Woodwinds
    (v_org_id, 'Flute', 'Fl', 'woodwinds', 200),
    (v_org_id, 'Piccolo', 'Picc', 'woodwinds', 201),
    (v_org_id, 'Alto Flute', 'AFl', 'woodwinds', 202),
    (v_org_id, 'Bass Flute', 'BFl', 'woodwinds', 203),
    (v_org_id, 'Oboe', 'Ob', 'woodwinds', 204),
    (v_org_id, 'Oboe d''Amore', 'OdA', 'woodwinds', 205),
    (v_org_id, 'English Horn', 'EH', 'woodwinds', 206),
    (v_org_id, 'Clarinet', 'Cl', 'woodwinds', 207),
    (v_org_id, 'Clarinet in A', 'Cl(A)', 'woodwinds', 208),
    (v_org_id, 'Eb Clarinet', 'EbCl', 'woodwinds', 209),
    (v_org_id, 'Bass Clarinet', 'BCl', 'woodwinds', 210),
    (v_org_id, 'Contrabass Clarinet', 'CbCl', 'woodwinds', 211),
    (v_org_id, 'Bassoon', 'Bsn', 'woodwinds', 212),
    (v_org_id, 'Contrabassoon', 'Cbsn', 'woodwinds', 213),
    (v_org_id, 'Soprano Saxophone', 'SSax', 'woodwinds', 214),
    (v_org_id, 'Alto Saxophone', 'ASax', 'woodwinds', 215),
    (v_org_id, 'Tenor Saxophone', 'TSax', 'woodwinds', 216),
    (v_org_id, 'Baritone Saxophone', 'BSax', 'woodwinds', 217),
    (v_org_id, 'Recorder', 'Rec', 'woodwinds', 218),
    -- Brass
    (v_org_id, 'French Horn', 'Hn', 'brass', 300),
    (v_org_id, 'Trumpet', 'Tpt', 'brass', 301),
    (v_org_id, 'Piccolo Trumpet', 'PicTpt', 'brass', 302),
    (v_org_id, 'Cornet', 'Cnt', 'brass', 303),
    (v_org_id, 'Flugelhorn', 'Flug', 'brass', 304),
    (v_org_id, 'Trombone', 'Tbn', 'brass', 305),
    (v_org_id, 'Alto Trombone', 'ATbn', 'brass', 306),
    (v_org_id, 'Bass Trombone', 'BTbn', 'brass', 307),
    (v_org_id, 'Bass Trumpet', 'BTpt', 'brass', 308),
    (v_org_id, 'Euphonium', 'Euph', 'brass', 309),
    (v_org_id, 'Tuba', 'Tba', 'brass', 310),
    (v_org_id, 'Wagner Tuba', 'WTba', 'brass', 311),
    -- Percussion
    (v_org_id, 'Timpani', 'Timp', 'percussion', 400),
    (v_org_id, 'Percussion', 'Perc', 'percussion', 401),
    (v_org_id, 'Snare Drum', 'SD', 'percussion', 402),
    (v_org_id, 'Bass Drum', 'BD', 'percussion', 403),
    (v_org_id, 'Cymbals', 'Cym', 'percussion', 404),
    (v_org_id, 'Tam-tam', 'TT', 'percussion', 405),
    (v_org_id, 'Triangle', 'Tri', 'percussion', 406),
    (v_org_id, 'Tambourine', 'Tamb', 'percussion', 407),
    (v_org_id, 'Crotales', 'Crot', 'percussion', 408),
    (v_org_id, 'Vibraphone', 'Vib', 'percussion', 409),
    (v_org_id, 'Marimba', 'Mar', 'percussion', 410),
    (v_org_id, 'Xylophone', 'Xyl', 'percussion', 411),
    (v_org_id, 'Glockenspiel', 'Glock', 'percussion', 412),
    (v_org_id, 'Chimes', 'Chm', 'percussion', 413),
    (v_org_id, 'Drum Set', 'Drums', 'percussion', 414),
    -- Keyboards & Other
    (v_org_id, 'Piano', 'Pno', 'other', 500),
    (v_org_id, 'Keyboard', 'Kbd', 'other', 501),
    (v_org_id, 'Celesta', 'Cel', 'other', 502),
    (v_org_id, 'Organ', 'Org', 'other', 503),
    (v_org_id, 'Harpsichord', 'Hpd', 'other', 504),
    (v_org_id, 'Synthesizer', 'Synth', 'other', 505),
    (v_org_id, 'Accordion', 'Acc', 'other', 506),
    -- Voices
    (v_org_id, 'Voice - Soprano', 'Sop', 'other', 600),
    (v_org_id, 'Voice - Mezzo-Soprano', 'Mez', 'other', 601),
    (v_org_id, 'Voice - Alto', 'Alto', 'other', 602),
    (v_org_id, 'Voice - Countertenor', 'CTen', 'other', 603),
    (v_org_id, 'Voice - Tenor', 'Ten', 'other', 604),
    (v_org_id, 'Voice - Baritone', 'Bar', 'other', 605),
    (v_org_id, 'Voice - Bass', 'Bas', 'other', 606),
    -- Staff
    (v_org_id, 'Conductor', 'Cond', 'other', 700),
    (v_org_id, 'Music Librarian', 'Lib', 'other', 701);

  RETURN json_build_object(
    'id', v_org_id,
    'name', p_name,
    'slug', v_final_slug,
    'timezone', p_timezone
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 030_update_default_brand_color.sql
-- ============================================================
-- Update organizations using the old default blue (#3b82f6) to Podium navy (#1E293B)
UPDATE organizations
SET email_brand_color = '#1E293B'
WHERE email_brand_color = '#3b82f6' OR email_brand_color IS NULL;

-- Update the column default for new organizations
ALTER TABLE organizations
  ALTER COLUMN email_brand_color SET DEFAULT '#1E293B';


-- ============================================================
-- 031_fix_case_insensitive_email_linking.sql
-- ============================================================
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


-- ============================================================
-- 032_add_w9_upload_storage.sql
-- ============================================================
-- Add W-9 file URL column so musicians can upload their W-9 via the portal.
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS w9_file_url TEXT;

-- Create a private storage bucket for W-9 documents.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'w9-documents',
  'w9-documents',
  false,
  5242880, -- 5MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- Musicians can upload W-9 files into their own folder (user_id as folder name).
CREATE POLICY "Musicians upload own W9"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'w9-documents'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Musicians can view their own W-9 files.
CREATE POLICY "Musicians read own W9"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'w9-documents'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Musicians can update (replace) their own W-9 files.
CREATE POLICY "Musicians update own W9"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'w9-documents'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Musicians can delete their own W-9 files.
CREATE POLICY "Musicians delete own W9"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'w9-documents'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Service role (admin) can read all W-9 files.
CREATE POLICY "Admin read all W9"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'w9-documents'
  AND auth.role() = 'service_role'
);


-- ============================================================
-- 033_musician_portal_rls.sql
-- ============================================================
-- Musicians need to see their own project positions, projects, services,
-- and organizations in the musician portal. Without these policies,
-- the schedule, offers, and connected orgs pages are all empty.

-- Musicians can view project positions where they are the assigned musician
CREATE POLICY "Musicians can view own positions"
  ON project_positions FOR SELECT
  USING (
    musician_id IN (
      SELECT id FROM musicians WHERE user_id = auth.uid()
    )
  );

-- Musicians can view projects that they have positions in
CREATE POLICY "Musicians can view own projects"
  ON projects FOR SELECT
  USING (
    id IN (
      SELECT pp.project_id FROM project_positions pp
      JOIN musicians m ON m.id = pp.musician_id
      WHERE m.user_id = auth.uid()
    )
  );

-- Musicians can view services for projects they are assigned to
CREATE POLICY "Musicians can view own services"
  ON services FOR SELECT
  USING (
    project_id IN (
      SELECT pp.project_id FROM project_positions pp
      JOIN musicians m ON m.id = pp.musician_id
      WHERE m.user_id = auth.uid()
    )
  );

-- Musicians can view their organization
CREATE POLICY "Musicians can view own organization"
  ON organizations FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM musicians WHERE user_id = auth.uid()
    )
  );

-- Musicians can view contract offers sent to them
CREATE POLICY "Musicians can view own offers"
  ON contract_offers FOR SELECT
  USING (
    musician_id IN (
      SELECT id FROM musicians WHERE user_id = auth.uid()
    )
  );

-- Musicians can view instruments (needed for position display)
CREATE POLICY "Musicians can view instruments"
  ON instruments FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM musicians WHERE user_id = auth.uid()
    )
  );

-- Musicians can view venues for their services
CREATE POLICY "Musicians can view venues"
  ON venues FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM musicians WHERE user_id = auth.uid()
    )
  );


-- ============================================================
-- 034_fix_musician_rls_recursion.sql
-- ============================================================
-- Fix infinite recursion in musician portal RLS policies.
-- The policies from 033 caused cycles:
--   projects policy → project_positions (has RLS) → projects policy → ∞
--
-- Fix: use SECURITY DEFINER functions that bypass RLS to resolve
-- musician IDs and project IDs without triggering cascading policy checks.

-- Drop the recursive policies
DROP POLICY IF EXISTS "Musicians can view own projects" ON projects;
DROP POLICY IF EXISTS "Musicians can view own services" ON services;
DROP POLICY IF EXISTS "Musicians can view own positions" ON project_positions;
DROP POLICY IF EXISTS "Musicians can view own offers" ON contract_offers;
DROP POLICY IF EXISTS "Musicians can view own organization" ON organizations;
DROP POLICY IF EXISTS "Musicians can view instruments" ON instruments;
DROP POLICY IF EXISTS "Musicians can view venues" ON venues;

-- Helper: get all musician IDs for the current auth user (bypasses RLS)
CREATE OR REPLACE FUNCTION get_musician_ids_for_auth_user()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id FROM musicians WHERE user_id = auth.uid();
$$;

-- Helper: get all project IDs the current auth user is assigned to (bypasses RLS)
CREATE OR REPLACE FUNCTION get_musician_project_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT DISTINCT pp.project_id
  FROM project_positions pp
  JOIN musicians m ON m.id = pp.musician_id
  WHERE m.user_id = auth.uid();
$$;

-- Helper: get org IDs for the current auth user's musician records (bypasses RLS)
CREATE OR REPLACE FUNCTION get_musician_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT DISTINCT organization_id FROM musicians WHERE user_id = auth.uid();
$$;

-- Recreate policies using the SECURITY DEFINER helpers (no cross-table RLS triggers)

CREATE POLICY "Musicians can view own positions"
  ON project_positions FOR SELECT
  USING (musician_id IN (SELECT get_musician_ids_for_auth_user()));

CREATE POLICY "Musicians can view own projects"
  ON projects FOR SELECT
  USING (id IN (SELECT get_musician_project_ids()));

CREATE POLICY "Musicians can view own services"
  ON services FOR SELECT
  USING (project_id IN (SELECT get_musician_project_ids()));

CREATE POLICY "Musicians can view own offers"
  ON contract_offers FOR SELECT
  USING (musician_id IN (SELECT get_musician_ids_for_auth_user()));

CREATE POLICY "Musicians can view own organization"
  ON organizations FOR SELECT
  USING (id IN (SELECT get_musician_org_ids()));

CREATE POLICY "Musicians can view instruments"
  ON instruments FOR SELECT
  USING (organization_id IN (SELECT get_musician_org_ids()));

CREATE POLICY "Musicians can view venues"
  ON venues FOR SELECT
  USING (organization_id IN (SELECT get_musician_org_ids()));


-- ============================================================
-- 035_musician_sub_request_rls.sql
-- ============================================================
-- Allow musicians to view their own substitution requests via the portal.
-- Uses the SECURITY DEFINER helper from migration 034.

CREATE POLICY "Musicians can view own sub requests"
  ON substitution_requests FOR SELECT
  USING (requesting_musician_id IN (SELECT get_musician_ids_for_auth_user()));


-- ============================================================
-- 036_book_entries_nullable_musician.sql
-- ============================================================
-- Allow book_entries to have NULL musician_id
-- This supports adding instrument slots to an ensemble without a musician assigned yet
ALTER TABLE book_entries ALTER COLUMN musician_id DROP NOT NULL;


-- ============================================================
-- 037_add_ensemble_type.sql
-- ============================================================
-- Add ensemble_type to projects so musicians know the ensemble when receiving offers
ALTER TABLE projects ADD COLUMN ensemble_type TEXT;

-- Backfill existing projects based on name patterns
UPDATE projects SET ensemble_type = 'String Quartet' WHERE name ILIKE '%string quartet%' AND ensemble_type IS NULL;
UPDATE projects SET ensemble_type = 'String Trio' WHERE name ILIKE '%string trio%' AND ensemble_type IS NULL;
UPDATE projects SET ensemble_type = 'Duo' WHERE name ILIKE '%duo%' AND ensemble_type IS NULL;
UPDATE projects SET ensemble_type = 'Solo' WHERE name ILIKE '%solo%' AND ensemble_type IS NULL;
UPDATE projects SET ensemble_type = 'Orchestra' WHERE name ILIKE '%orchestra%' AND ensemble_type IS NULL;


-- ============================================================
-- 038_add_email_logs.sql
-- ============================================================
-- Email audit log: track every email sent from the platform
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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


-- ============================================================
-- 039_gig_detail_sends.sql
-- ============================================================
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


-- ============================================================
-- 040_offer_reminder_sent_at.sql
-- ============================================================
-- Track when automated 24-hour reminder was sent to avoid double-sending
ALTER TABLE contract_offers ADD COLUMN reminder_sent_at TIMESTAMPTZ;


-- ============================================================
-- 041_project_files.sql
-- ============================================================
-- Files uploaded per project
CREATE TABLE project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  scope TEXT NOT NULL DEFAULT 'all',  -- 'all' = everyone, 'assigned' = specific instruments
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

-- Which instruments get which files (only for scope='assigned')
CREATE TABLE project_file_instruments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES project_files(id) ON DELETE CASCADE,
  instrument_id UUID NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  UNIQUE(file_id, instrument_id)
);

-- Track when admin sends music notifications
CREATE TABLE music_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_by UUID NOT NULL REFERENCES auth.users(id),
  musician_count INT NOT NULL DEFAULT 0,
  notes TEXT
);

-- Per-musician confirmation
CREATE TABLE music_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  send_id UUID NOT NULL REFERENCES music_sends(id) ON DELETE CASCADE,
  musician_id UUID NOT NULL REFERENCES musicians(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  email_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  UNIQUE(send_id, musician_id)
);

-- Track individual file downloads per musician
CREATE TABLE project_file_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES project_files(id) ON DELETE CASCADE,
  musician_id UUID NOT NULL REFERENCES musicians(id) ON DELETE CASCADE,
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_project_files_project ON project_files(project_id);
CREATE INDEX idx_music_sends_project ON music_sends(project_id);
CREATE INDEX idx_music_confirmations_token ON music_confirmations(token);
CREATE INDEX idx_project_file_downloads_file ON project_file_downloads(file_id);
CREATE INDEX idx_project_file_downloads_musician ON project_file_downloads(musician_id);

-- RLS for project_files
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view project files"
  ON project_files FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Org admins can insert project files"
  ON project_files FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE POLICY "Org admins can delete project files"
  ON project_files FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- RLS for project_file_instruments
ALTER TABLE project_file_instruments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view file instruments"
  ON project_file_instruments FOR SELECT
  USING (file_id IN (
    SELECT id FROM project_files WHERE organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Org admins can insert file instruments"
  ON project_file_instruments FOR INSERT
  WITH CHECK (file_id IN (
    SELECT id FROM project_files WHERE organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  ));

-- RLS for music_sends
ALTER TABLE music_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view music sends"
  ON music_sends FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Org admins can insert music sends"
  ON music_sends FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- RLS for music_confirmations
ALTER TABLE music_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view music confirmations"
  ON music_confirmations FOR SELECT
  USING (send_id IN (
    SELECT id FROM music_sends WHERE organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Org admins can insert music confirmations"
  ON music_confirmations FOR INSERT
  WITH CHECK (send_id IN (
    SELECT id FROM music_sends WHERE organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  ));

-- RLS for project_file_downloads
ALTER TABLE project_file_downloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view downloads"
  ON project_file_downloads FOR SELECT
  USING (file_id IN (
    SELECT id FROM project_files WHERE organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Musicians can insert own downloads"
  ON project_file_downloads FOR INSERT
  WITH CHECK (musician_id IN (
    SELECT id FROM musicians WHERE user_id = auth.uid()
  ));

-- Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-files',
  'project-files',
  false,
  41943040,  -- 40MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Org admins upload project files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'project-files'
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Authenticated users read project files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'project-files'
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Authenticated users delete project files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'project-files'
  AND auth.uid() IS NOT NULL
);


-- ============================================================
-- 042_update_file_size_limit.sql
-- ============================================================
-- Increase project-files bucket size limit from 20MB to 40MB
UPDATE storage.buckets SET file_size_limit = 41943040 WHERE id = 'project-files';


-- ============================================================
-- 043_zip_coordinates_rls.sql
-- ============================================================
-- Enable RLS on zip_coordinates (flagged by Supabase Security Advisor)
-- This is a read-only reference table of US zip code coordinates
ALTER TABLE zip_coordinates ENABLE ROW LEVEL SECURITY;

-- Allow any authenticated user to read zip coordinates
CREATE POLICY "Authenticated users can view zip coordinates"
  ON zip_coordinates FOR SELECT
  TO authenticated
  USING (true);


-- ============================================================
-- 044_musician_address.sql
-- ============================================================
-- Add address fields to musicians table
ALTER TABLE musicians ADD COLUMN street_address TEXT;
ALTER TABLE musicians ADD COLUMN city TEXT;
ALTER TABLE musicians ADD COLUMN state VARCHAR(2);


-- ============================================================
-- 045_call_order_nullable.sql
-- ============================================================
-- Change call_order default from 100 to NULL
-- Musicians without an explicit call order should show as unranked
ALTER TABLE musicians ALTER COLUMN call_order SET DEFAULT NULL;

-- Convert existing default-100 values to NULL (these were never explicitly set)
UPDATE musicians SET call_order = NULL WHERE call_order = 100;


-- ============================================================
-- 046_add_billing.sql
-- ============================================================
-- Add billing columns to organizations for Stripe subscription management
ALTER TABLE organizations
  ADD COLUMN plan_tier TEXT NOT NULL DEFAULT 'trial'
    CHECK (plan_tier IN ('trial', 'free', 'pro')),
  ADD COLUMN trial_ends_at TIMESTAMPTZ,
  ADD COLUMN stripe_customer_id TEXT UNIQUE,
  ADD COLUMN stripe_subscription_id TEXT UNIQUE,
  ADD COLUMN subscription_status TEXT
    CHECK (subscription_status IN (
      'active', 'past_due', 'canceled', 'incomplete',
      'incomplete_expired', 'trialing', 'unpaid', 'paused'
    ));

-- Backfill existing orgs: give them 14-day trial starting now
UPDATE organizations
SET trial_ends_at = NOW() + INTERVAL '14 days'
WHERE trial_ends_at IS NULL;

-- Replace create_organization_with_owner to set trial_ends_at on new orgs
CREATE OR REPLACE FUNCTION create_organization_with_owner(
  p_name TEXT,
  p_slug TEXT,
  p_timezone TEXT
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_final_slug TEXT := p_slug;
  v_existing UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_existing FROM organizations WHERE slug = v_final_slug;
  IF v_existing IS NOT NULL THEN
    v_final_slug := v_final_slug || '-' || substr(md5(random()::text), 1, 4);
  END IF;

  INSERT INTO organizations (name, slug, timezone, trial_ends_at)
  VALUES (p_name, v_final_slug, p_timezone, NOW() + INTERVAL '14 days')
  RETURNING id INTO v_org_id;

  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (v_org_id, v_user_id, 'owner');

  -- Auto-populate standard instruments (64 instruments)
  INSERT INTO instruments (organization_id, name, abbreviation, section, sort_order) VALUES
    -- Strings
    (v_org_id, 'Violin 1', 'Vln 1', 'strings', 100),
    (v_org_id, 'Violin 2', 'Vln 2', 'strings', 101),
    (v_org_id, 'Viola', 'Vla', 'strings', 102),
    (v_org_id, 'Cello', 'Vc', 'strings', 103),
    (v_org_id, 'Double Bass', 'Db', 'strings', 104),
    (v_org_id, 'Harp', 'Hp', 'strings', 105),
    (v_org_id, 'Guitar', 'Gtr', 'strings', 106),
    (v_org_id, 'Electric Guitar', 'EGtr', 'strings', 107),
    (v_org_id, 'Bass Guitar', 'Bass', 'strings', 108),
    (v_org_id, 'Banjo', 'Bnj', 'strings', 109),
    (v_org_id, 'Mandolin', 'Mand', 'strings', 110),
    -- Woodwinds
    (v_org_id, 'Flute', 'Fl', 'woodwinds', 200),
    (v_org_id, 'Piccolo', 'Picc', 'woodwinds', 201),
    (v_org_id, 'Alto Flute', 'AFl', 'woodwinds', 202),
    (v_org_id, 'Bass Flute', 'BFl', 'woodwinds', 203),
    (v_org_id, 'Oboe', 'Ob', 'woodwinds', 204),
    (v_org_id, 'Oboe d''Amore', 'OdA', 'woodwinds', 205),
    (v_org_id, 'English Horn', 'EH', 'woodwinds', 206),
    (v_org_id, 'Clarinet', 'Cl', 'woodwinds', 207),
    (v_org_id, 'Clarinet in A', 'Cl(A)', 'woodwinds', 208),
    (v_org_id, 'Eb Clarinet', 'EbCl', 'woodwinds', 209),
    (v_org_id, 'Bass Clarinet', 'BCl', 'woodwinds', 210),
    (v_org_id, 'Contrabass Clarinet', 'CbCl', 'woodwinds', 211),
    (v_org_id, 'Bassoon', 'Bsn', 'woodwinds', 212),
    (v_org_id, 'Contrabassoon', 'Cbsn', 'woodwinds', 213),
    (v_org_id, 'Soprano Saxophone', 'SSax', 'woodwinds', 214),
    (v_org_id, 'Alto Saxophone', 'ASax', 'woodwinds', 215),
    (v_org_id, 'Tenor Saxophone', 'TSax', 'woodwinds', 216),
    (v_org_id, 'Baritone Saxophone', 'BSax', 'woodwinds', 217),
    (v_org_id, 'Recorder', 'Rec', 'woodwinds', 218),
    -- Brass
    (v_org_id, 'French Horn', 'Hn', 'brass', 300),
    (v_org_id, 'Trumpet', 'Tpt', 'brass', 301),
    (v_org_id, 'Piccolo Trumpet', 'PicTpt', 'brass', 302),
    (v_org_id, 'Cornet', 'Cnt', 'brass', 303),
    (v_org_id, 'Flugelhorn', 'Flug', 'brass', 304),
    (v_org_id, 'Trombone', 'Tbn', 'brass', 305),
    (v_org_id, 'Alto Trombone', 'ATbn', 'brass', 306),
    (v_org_id, 'Bass Trombone', 'BTbn', 'brass', 307),
    (v_org_id, 'Bass Trumpet', 'BTpt', 'brass', 308),
    (v_org_id, 'Euphonium', 'Euph', 'brass', 309),
    (v_org_id, 'Tuba', 'Tba', 'brass', 310),
    (v_org_id, 'Wagner Tuba', 'WTba', 'brass', 311),
    -- Percussion
    (v_org_id, 'Timpani', 'Timp', 'percussion', 400),
    (v_org_id, 'Percussion', 'Perc', 'percussion', 401),
    (v_org_id, 'Snare Drum', 'SD', 'percussion', 402),
    (v_org_id, 'Bass Drum', 'BD', 'percussion', 403),
    (v_org_id, 'Cymbals', 'Cym', 'percussion', 404),
    (v_org_id, 'Tam-tam', 'TT', 'percussion', 405),
    (v_org_id, 'Triangle', 'Tri', 'percussion', 406),
    (v_org_id, 'Tambourine', 'Tamb', 'percussion', 407),
    (v_org_id, 'Crotales', 'Crot', 'percussion', 408),
    (v_org_id, 'Vibraphone', 'Vib', 'percussion', 409),
    (v_org_id, 'Marimba', 'Mar', 'percussion', 410),
    (v_org_id, 'Xylophone', 'Xyl', 'percussion', 411),
    (v_org_id, 'Glockenspiel', 'Glock', 'percussion', 412),
    (v_org_id, 'Chimes', 'Chm', 'percussion', 413),
    (v_org_id, 'Drum Set', 'Drums', 'percussion', 414),
    -- Keyboards & Other
    (v_org_id, 'Piano', 'Pno', 'other', 500),
    (v_org_id, 'Keyboard', 'Kbd', 'other', 501),
    (v_org_id, 'Celesta', 'Cel', 'other', 502),
    (v_org_id, 'Organ', 'Org', 'other', 503),
    (v_org_id, 'Harpsichord', 'Hpd', 'other', 504),
    (v_org_id, 'Synthesizer', 'Synth', 'other', 505),
    (v_org_id, 'Accordion', 'Acc', 'other', 506),
    -- Voices
    (v_org_id, 'Voice - Soprano', 'Sop', 'other', 600),
    (v_org_id, 'Voice - Mezzo-Soprano', 'Mez', 'other', 601),
    (v_org_id, 'Voice - Alto', 'Alto', 'other', 602),
    (v_org_id, 'Voice - Countertenor', 'CTen', 'other', 603),
    (v_org_id, 'Voice - Tenor', 'Ten', 'other', 604),
    (v_org_id, 'Voice - Baritone', 'Bar', 'other', 605),
    (v_org_id, 'Voice - Bass', 'Bas', 'other', 606),
    -- Staff
    (v_org_id, 'Conductor', 'Cond', 'other', 700),
    (v_org_id, 'Music Librarian', 'Lib', 'other', 701);

  RETURN json_build_object(
    'id', v_org_id,
    'name', p_name,
    'slug', v_final_slug,
    'timezone', p_timezone
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 047_ensure_rls_all_tables.sql
-- ============================================================
-- Ensure RLS is enabled on ALL public tables.
-- Fixes Supabase Security Advisor warnings:
--   "Policy exists, RLS disabled" — policies exist but aren't enforced
--   "RLS disabled in public"     — tables exposed without any protection
--
-- ENABLE ROW LEVEL SECURITY is idempotent; safe to re-run.

-- Core tables (001_initial_schema)
ALTER TABLE organizations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE instruments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE musicians                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE musician_instruments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE books                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_entries               ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE services                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_positions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_offers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE substitution_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE competing_schedules        ENABLE ROW LEVEL SECURITY;

-- Venues (003)
ALTER TABLE venues                     ENABLE ROW LEVEL SECURITY;

-- Zip coordinates (006, RLS added in 043)
ALTER TABLE zip_coordinates            ENABLE ROW LEVEL SECURITY;

-- Payments (013)
ALTER TABLE payments                   ENABLE ROW LEVEL SECURITY;

-- Staffing presets (014)
ALTER TABLE staffing_presets           ENABLE ROW LEVEL SECURITY;

-- Musician notification preferences (016)
ALTER TABLE musician_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Tutorial state (022)
ALTER TABLE user_tutorial_state        ENABLE ROW LEVEL SECURITY;

-- Impersonation log (028)
ALTER TABLE impersonation_log          ENABLE ROW LEVEL SECURITY;

-- Email logs (038)
ALTER TABLE email_logs                 ENABLE ROW LEVEL SECURITY;

-- Gig detail sends & confirmations (039)
ALTER TABLE gig_detail_sends           ENABLE ROW LEVEL SECURITY;
ALTER TABLE gig_detail_confirmations   ENABLE ROW LEVEL SECURITY;

-- Project files system (041)
ALTER TABLE project_files              ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_file_instruments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE music_sends                ENABLE ROW LEVEL SECURITY;
ALTER TABLE music_confirmations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_file_downloads     ENABLE ROW LEVEL SECURITY;

-- Catch-all: enable RLS on any public table we may have missed.
-- This handles tables created outside of migrations (e.g., via dashboard).
DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE 'pg_%'
      AND tablename NOT LIKE '_prisma_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl.tablename);
  END LOOP;
END;
$$;


-- ============================================================
-- 048_add_performance_indexes.sql
-- ============================================================
-- Performance indexes for queries that will degrade as data grows
-- These cover the most common lookup patterns not already indexed

-- Contract offers: lookup by musician and filtering by status
CREATE INDEX IF NOT EXISTS idx_contract_offers_musician ON contract_offers(musician_id);
CREATE INDEX IF NOT EXISTS idx_contract_offers_status ON contract_offers(status);

-- Project positions: lookup by musician (e.g., "what projects is this musician on?")
CREATE INDEX IF NOT EXISTS idx_project_positions_musician ON project_positions(musician_id);

-- Payments: composite for org billing dashboard queries
CREATE INDEX IF NOT EXISTS idx_payments_org_service ON payments(organization_id, service_id);

-- Music confirmations: lookup by send_id for batch status checks
CREATE INDEX IF NOT EXISTS idx_music_confirmations_send ON music_confirmations(send_id);

-- Gig detail confirmations: lookup by send_id
CREATE INDEX IF NOT EXISTS idx_gig_detail_confirmations_send ON gig_detail_confirmations(send_id);


-- ============================================================
-- 049_enforce_invite_token_expiry.sql
-- ============================================================
-- Enforce portal invite token expiry in the activation function
-- Previously, expired tokens could still be used to activate accounts
CREATE OR REPLACE FUNCTION activate_musician_by_token(p_user_id UUID, p_token TEXT)
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE musicians
    SET user_id = p_user_id,
        portal_invite_token = NULL,
        portal_invite_sent_at = NULL,
        portal_invite_expires_at = NULL
    WHERE portal_invite_token = p_token
    AND user_id IS NULL
    AND (portal_invite_expires_at IS NULL OR portal_invite_expires_at > NOW());

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 050_w9_verification_and_payment_audit.sql
-- ============================================================
-- W-9 admin verification fields
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS w9_verified_at TIMESTAMPTZ;
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS w9_verified_by UUID REFERENCES auth.users(id);

-- Payment audit trail: who marked it paid
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES auth.users(id);

-- Index for 1099 report queries (year-end aggregation by musician)
CREATE INDEX IF NOT EXISTS idx_payments_musician_paid
  ON payments(musician_id, status, payment_date) WHERE status = 'paid';

-- Index for dashboard unpaid payment prompt (past services with unpaid payments)
CREATE INDEX IF NOT EXISTS idx_payments_org_status
  ON payments(organization_id, status) WHERE status = 'unpaid';


-- ============================================================
-- 051_project_client_booking_fields.sql
-- ============================================================
-- Client & booking pipeline fields for projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_email TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_phone TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_amount NUMERIC(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deposit_paid_at DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending'
  CHECK (payment_status IN ('pending', 'deposit_paid', 'fully_paid'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS payment_notes TEXT;


-- ============================================================
-- 052_project_coordinator_fields.sql
-- ============================================================
-- Add coordinator/venue contact fields to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS coordinator_name text,
  ADD COLUMN IF NOT EXISTS coordinator_email text,
  ADD COLUMN IF NOT EXISTS coordinator_phone text;


-- ============================================================
-- 053_pre_gig_reminders.sql
-- ============================================================
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


-- ============================================================
-- 054_reminder_templates.sql
-- ============================================================
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


-- ============================================================
-- 055_email_logs_body.sql
-- ============================================================
-- Add body column to email_logs so we can display email content in the dashboard
ALTER TABLE email_logs ADD COLUMN body TEXT;


-- ============================================================
-- 056_org_staffing_alerts_setting.sql
-- ============================================================
-- Add opt-out flag for staffing alert emails
ALTER TABLE organizations
  ADD COLUMN disable_staffing_alerts BOOLEAN NOT NULL DEFAULT false;


-- ============================================================
-- 057_fix_venue_maps_urls.sql
-- ============================================================
-- Fix venue Google Maps URLs to use the official Maps URLs API format.
-- Old format: /maps/place/?q=place_id:XXXX (undocumented, unreliable)
-- New format: /maps/search/?api=1&query=NAME,ADDRESS&query_place_id=XXXX (official)
--
-- This updates venues that have a google_place_id and the old-style URL.
-- The query param uses name + address for a human-readable fallback.

UPDATE venues
SET google_maps_url =
  'https://www.google.com/maps/search/?api=1&query=' ||
  replace(
    replace(
      concat_ws(', ',
        NULLIF(name, ''),
        NULLIF(address, ''),
        NULLIF(city, ''),
        NULLIF(state, ''),
        NULLIF(zip, '')
      ),
      ' ', '+'
    ),
    ',', '%2C'
  ) ||
  '&query_place_id=' || google_place_id
WHERE google_place_id IS NOT NULL
  AND google_maps_url LIKE '%/maps/place/?q=place_id:%';


-- ============================================================
-- 058_add_venue_2.sql
-- ============================================================
-- Add optional second venue to services for gigs with multiple locations
-- (e.g. ceremony at a church, reception at a resort).
ALTER TABLE services ADD COLUMN venue_2 text;
ALTER TABLE services ADD COLUMN venue_id_2 uuid REFERENCES venues(id) ON DELETE SET NULL;


-- ============================================================
-- 059_backfill_service_venue_ids.sql
-- ============================================================
-- Backfill venue_id on services that have a venue name but no FK link.
-- Matches by exact name against venues in the same organization.
-- This prevents name-only Google Maps URLs that can resolve to the wrong location.

-- Venue 1
UPDATE services s
SET venue_id = v.id
FROM venues v, projects p
WHERE p.id = s.project_id
  AND s.venue IS NOT NULL
  AND s.venue_id IS NULL
  AND v.name = s.venue
  AND v.organization_id = p.organization_id;

-- Venue 2
UPDATE services s
SET venue_id_2 = v.id
FROM venues v, projects p
WHERE p.id = s.project_id
  AND s.venue_2 IS NOT NULL
  AND s.venue_id_2 IS NULL
  AND v.name = s.venue_2
  AND v.organization_id = p.organization_id;


-- ============================================================
-- 060_backfill_venue_maps_urls.sql
-- ============================================================
-- Backfill google_maps_url for venues that have address data but no maps URL.
-- Uses address-based search URL. The browser handles URL encoding of spaces/commas.
UPDATE venues
SET google_maps_url = 'https://www.google.com/maps/search/?api=1&query=' ||
  replace(
    replace(
      concat_ws(', ',
        NULLIF(name, ''),
        NULLIF(address, ''),
        NULLIF(city, ''),
        NULLIF(state, ''),
        NULLIF(zip, '')
      ),
      ' ', '+'
    ),
    ',', '%2C'
  )
WHERE google_maps_url IS NULL
  AND (address IS NOT NULL OR city IS NOT NULL);


-- ============================================================
-- 061_add_rescinded_offer_status.sql
-- ============================================================
-- Add 'rescinded' as a distinct contract_offer status.
-- 'declined' = the musician declined the offer.
-- 'rescinded' = the admin withdrew the offer (musician never declined it).
-- Keeping the two separate preserves accurate history and lets emails/UI speak honestly.

ALTER TABLE contract_offers DROP CONSTRAINT IF EXISTS contract_offers_status_check;

ALTER TABLE contract_offers
  ADD CONSTRAINT contract_offers_status_check
  CHECK (status IN ('pending', 'viewed', 'accepted', 'declined', 'rescinded', 'expired'));


-- ============================================================
-- 062_protect_payment_records.sql
-- ============================================================
-- Protect financial / 1099 tax records from accidental cascade deletion.
--
-- Before this migration, payments.musician_id and payments.service_id were
-- ON DELETE CASCADE. That meant deleting a musician — or deleting a project,
-- which cascades into its services — permanently destroyed every payment row,
-- including status='paid' records used for year-end 1099 reporting, with no
-- recovery path.
--
-- Switch both foreign keys to ON DELETE RESTRICT so the database itself refuses
-- to delete any musician or service that still has payment rows. The app now
-- archives (deactivates) such records instead of hard-deleting them.
--
-- payments.project_position_id stays ON DELETE SET NULL (unchanged) — losing the
-- position link does not destroy the financial record.

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_musician_id_fkey;
ALTER TABLE payments
  ADD CONSTRAINT payments_musician_id_fkey
  FOREIGN KEY (musician_id) REFERENCES musicians(id) ON DELETE RESTRICT;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_service_id_fkey;
ALTER TABLE payments
  ADD CONSTRAINT payments_service_id_fkey
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT;


-- ============================================================
-- 063_add_released_offer_status.sql
-- ============================================================
-- Add 'released' as a distinct contract_offer status.
--
-- When a musician who has ACCEPTED a chair requests a substitute and that sub
-- accepts, the original musician's prior accepted offer must move to a terminal
-- state so they are no longer counted as confirmed for that chair. 'released'
-- captures this honestly (distinct from 'declined' = the musician said no, and
-- 'rescinded' = the admin withdrew the offer).

ALTER TABLE contract_offers DROP CONSTRAINT IF EXISTS contract_offers_status_check;

ALTER TABLE contract_offers
  ADD CONSTRAINT contract_offers_status_check
  CHECK (status IN ('pending', 'viewed', 'accepted', 'declined', 'rescinded', 'expired', 'released'));


-- ============================================================
-- 064_stripe_event_idempotency.sql
-- ============================================================
-- Idempotency log for Stripe webhook events.
--
-- Stripe retries webhooks (and may deliver out of order), so the handler must
-- process each event id at most once. We record every event id here the first
-- time we see it; a duplicate insert (unique-violation on the PK) tells the
-- handler the event was already processed and can be safely ignored.

CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only the service-role webhook reads/writes this table; service role bypasses
-- RLS. Enable RLS with no policies so nothing else can touch it.
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;

