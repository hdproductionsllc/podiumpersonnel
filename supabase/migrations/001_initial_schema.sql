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
