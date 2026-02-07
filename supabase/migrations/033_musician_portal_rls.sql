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
