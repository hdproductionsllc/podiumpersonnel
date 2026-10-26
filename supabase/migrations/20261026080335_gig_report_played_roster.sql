-- Explicit admin confirmation of who actually played; NULL means not reviewed.
-- No backfill from invitations, accepted offers or the old lead selection.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS gig_report_musician_ids uuid[];
COMMENT ON COLUMN public.projects.gig_report_musician_ids IS
  'Admin-confirmed played roster for after-gig surveys. NULL: not reviewed; empty: nobody. No automatic attendance inference.';
