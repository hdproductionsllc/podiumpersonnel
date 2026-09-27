-- 089: After the gig — pay summary email + lead musician gig report
--
-- Thirty minutes after a gig's last service ends, the after-gig cron:
--   1. emails the org's owners and admins "here is what to pay each person"
--      (never the musicians), once per project;
--   2. asks every confirmed musician flagged as a leader on the roster
--      (musicians.is_leader) for a short no-login gig report: was everyone on
--      time, any hiccups, anything to follow up with the client, any
--      arrangements that need work.
--
-- Additive only. One nullable column on `projects` and one new table. Nothing
-- existing is altered, so every flow that works today keeps working with this
-- applied and the code not yet deployed.

-- ---------------------------------------------------------------------------
-- 1. Pay summary: sent once per project
-- ---------------------------------------------------------------------------
--   NULL = not sent. The cron claims a project by setting this BEFORE it sends
--   (UPDATE ... WHERE pay_summary_sent_at IS NULL), so two overlapping cron runs
--   can never both email the same summary.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS pay_summary_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN projects.pay_summary_sent_at IS
  'When the after-gig pay summary was emailed to the org owners/admins. NULL = not yet.';

-- ---------------------------------------------------------------------------
-- 2. Gig reports: one per (project, lead musician)
-- ---------------------------------------------------------------------------
--   Token: 256 bits, generated in the app with randomBytes(32) exactly as
--   contract_offers.token and 078's W-9 token are. The public /report/[token]
--   page resolves it and then reads/writes through the SERVICE client, the same
--   shape /gig/[token] uses, so no policy is added for `anon`.
--
--   Answers are plain columns rather than one JSON blob so the admin view and
--   any future reporting can read them without parsing.
CREATE TABLE IF NOT EXISTS gig_reports (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id         UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  musician_id        UUID NOT NULL REFERENCES musicians(id) ON DELETE CASCADE,
  token              TEXT NOT NULL,
  requested_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_at          TIMESTAMPTZ,
  submitted_at       TIMESTAMPTZ,
  -- 'great' | 'good' | 'issues'
  overall            TEXT CHECK (overall IS NULL OR overall IN ('great', 'good', 'issues')),
  all_on_time        BOOLEAN,
  late_notes         TEXT,
  hiccups            TEXT,
  client_follow_up   TEXT,
  arrangement_notes  TEXT,
  other_notes        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, musician_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gig_reports_token ON gig_reports(token);
CREATE INDEX IF NOT EXISTS idx_gig_reports_project ON gig_reports(project_id);

COMMENT ON TABLE gig_reports IS
  'Lead musician''s after-gig report. One row per (project, leader); token drives /report/[token].';

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------
--   ADMINS only, for reading too: a report can name a colleague who was late or
--   carry a note about the client, which is not for every org member. All
--   writes from the app go through the service client (the cron, the public
--   form, the admin "send now" route after its own admin check).
ALTER TABLE gig_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view gig reports" ON gig_reports;
CREATE POLICY "Admins can view gig reports"
  ON gig_reports FOR SELECT
  USING (is_org_admin(organization_id));

-- ===========================================================================
-- verify: the column and table exist, RLS is on, one SELECT policy, no anon.
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'projects' AND column_name = 'pay_summary_sent_at';
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'gig_reports';   -- t
-- SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'gig_reports';
