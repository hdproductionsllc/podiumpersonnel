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
