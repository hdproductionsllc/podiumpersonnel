-- Allow authenticated users to create organizations (needed for onboarding)
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON organizations;
CREATE POLICY "Authenticated users can create organizations"
  on organizations for insert
  with check (auth.uid() is not null);
