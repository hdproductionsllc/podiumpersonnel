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
