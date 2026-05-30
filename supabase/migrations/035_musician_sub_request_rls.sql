-- Allow musicians to view their own substitution requests via the portal.
-- Uses the SECURITY DEFINER helper from migration 034.

CREATE POLICY "Musicians can view own sub requests"
  ON substitution_requests FOR SELECT
  USING (requesting_musician_id IN (SELECT get_musician_ids_for_auth_user()));
