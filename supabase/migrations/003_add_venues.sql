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
