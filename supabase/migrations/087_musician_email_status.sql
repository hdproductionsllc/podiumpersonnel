-- 087: Musician email deliverability status (A8, 2026-09-18 hardening)
--
-- Today a dead/bounced musician email shows "sent" forever in email_logs —
-- Resend knows a send bounced or was marked spam, but nothing in the app ever
-- hears about it. This adds the two columns the new
-- src/app/api/webhooks/resend/route.ts writes to when Resend calls back on
-- `email.bounced` / `email.complained` / `email.delivered`:
--
--   - email_status: 'ok' (default) | 'bounced' | 'complained'
--   - email_status_at: when that status was last set
--
-- Additive and safe to apply anytime — defaults to 'ok' for every existing
-- row, so nothing changes until the webhook actually reports a problem.
-- src/components/musicians/musicians-client.tsx reads this to show a small
-- "Email bouncing" / "Complained" badge next to the musician's email.
--
-- Apply BEFORE (or alongside) deploying the webhook route — the route's
-- lookups on `musicians.email_status` fail loudly (500) if this hasn't run,
-- same as any other unapplied-migration case in this codebase.

ALTER TABLE musicians
  ADD COLUMN IF NOT EXISTS email_status TEXT NOT NULL DEFAULT 'ok'
    CHECK (email_status IN ('ok', 'bounced', 'complained')),
  ADD COLUMN IF NOT EXISTS email_status_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_musicians_email_status
  ON musicians(email_status)
  WHERE email_status <> 'ok';

-- verify: which musicians currently have a deliverability problem.
-- SELECT id, first_name, last_name, email, email_status, email_status_at
-- FROM musicians WHERE email_status <> 'ok' ORDER BY email_status_at DESC;
