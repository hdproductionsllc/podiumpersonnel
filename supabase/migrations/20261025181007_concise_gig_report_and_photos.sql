-- Additive survey fields only. Private photo bucket is a separate approval-gated migration.
-- Existing rows remain NULL; no backfill, policy or grant changes.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public.gig_reports ADD COLUMN IF NOT EXISTS details_accuracy text
  CHECK (details_accuracy IN ('matched', 'minor', 'significant'));
ALTER TABLE public.gig_reports ADD COLUMN IF NOT EXISTS client_feedback text
  CHECK (client_feedback IN ('positive', 'concern', 'none'));
