-- Ensure RLS is enabled on ALL public tables.
-- Fixes Supabase Security Advisor warnings:
--   "Policy exists, RLS disabled" — policies exist but aren't enforced
--   "RLS disabled in public"     — tables exposed without any protection
--
-- ENABLE ROW LEVEL SECURITY is idempotent; safe to re-run.

-- Core tables (001_initial_schema)
ALTER TABLE organizations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE instruments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE musicians                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE musician_instruments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE books                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_entries               ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE services                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_positions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_offers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE substitution_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE competing_schedules        ENABLE ROW LEVEL SECURITY;

-- Venues (003)
ALTER TABLE venues                     ENABLE ROW LEVEL SECURITY;

-- Zip coordinates (006, RLS added in 043)
ALTER TABLE zip_coordinates            ENABLE ROW LEVEL SECURITY;

-- Payments (013)
ALTER TABLE payments                   ENABLE ROW LEVEL SECURITY;

-- Staffing presets (014)
ALTER TABLE staffing_presets           ENABLE ROW LEVEL SECURITY;

-- Musician notification preferences (016)
ALTER TABLE musician_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Tutorial state (022)
ALTER TABLE user_tutorial_state        ENABLE ROW LEVEL SECURITY;

-- Impersonation log (028)
ALTER TABLE impersonation_log          ENABLE ROW LEVEL SECURITY;

-- Email logs (038)
ALTER TABLE email_logs                 ENABLE ROW LEVEL SECURITY;

-- Gig detail sends & confirmations (039)
ALTER TABLE gig_detail_sends           ENABLE ROW LEVEL SECURITY;
ALTER TABLE gig_detail_confirmations   ENABLE ROW LEVEL SECURITY;

-- Project files system (041)
ALTER TABLE project_files              ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_file_instruments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE music_sends                ENABLE ROW LEVEL SECURITY;
ALTER TABLE music_confirmations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_file_downloads     ENABLE ROW LEVEL SECURITY;

-- Catch-all: enable RLS on any public table we may have missed.
-- This handles tables created outside of migrations (e.g., via dashboard).
DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE 'pg_%'
      AND tablename NOT LIKE '_prisma_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl.tablename);
  END LOOP;
END;
$$;
