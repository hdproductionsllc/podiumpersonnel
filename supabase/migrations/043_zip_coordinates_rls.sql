-- Enable RLS on zip_coordinates (flagged by Supabase Security Advisor)
-- This is a read-only reference table of US zip code coordinates
ALTER TABLE zip_coordinates ENABLE ROW LEVEL SECURITY;

-- Allow any authenticated user to read zip coordinates
CREATE POLICY "Authenticated users can view zip coordinates"
  ON zip_coordinates FOR SELECT
  TO authenticated
  USING (true);
