-- ============================================================================
-- PODIUM — W-9 SELF-SUBMISSION (2026-07-25)
--
-- HOW TO RUN
--   1. Back up first, from your terminal:   node scripts/backup-database.js
--   2. Supabase Dashboard -> SQL Editor -> New query
--   3. Paste this ENTIRE file -> Run
--   4. Read the "RESULTS" table at the very bottom. All rows should say PASS.
--
-- Safe to run more than once. Running it twice changes nothing the second time.
--
-- WHAT IT DOES
--   Lets musicians upload their own W-9 from a link in their request email,
--   with no account and no password. The file lands in the private
--   w9-documents bucket and the musician's record is updated, so your existing
--   dashboard badges, the has-W-9 filter, the download link and the
--   verification flow all light up with no other changes.
--
-- WHY IT IS NEEDED
--   The old musician portal had a W-9 upload, but it required a login — so it
--   only ever worked for the few musicians who made an account. Everyone else
--   emailed a PDF that you re-uploaded by hand. Removing the portal took that
--   upload with it; this replaces it with something every musician can use.
--
-- NOTHING IS DELETED. This only adds columns and removes four dead security
-- rules that can no longer match anything (explained in PART 2).
-- ============================================================================


-- ============================================================================
-- PART 1 — Columns for the upload link
--
-- The token is 256 bits of randomness, the same strength as your gig links. It
-- is NOT created by default: a token only exists once you actually send a W-9
-- request, so a musician who was never asked has no live upload link.
-- ============================================================================

ALTER TABLE musicians
  ADD COLUMN IF NOT EXISTS w9_request_token      TEXT,
  ADD COLUMN IF NOT EXISTS w9_request_sent_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS w9_request_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS w9_uploaded_at        TIMESTAMPTZ;

-- One musician per token, and a fast lookup for the upload page. The WHERE
-- clause is what lets every musician sit at NULL without colliding.
CREATE UNIQUE INDEX IF NOT EXISTS idx_musicians_w9_request_token
  ON musicians(w9_request_token)
  WHERE w9_request_token IS NOT NULL;

COMMENT ON COLUMN musicians.w9_request_token IS
  'Single-musician upload token for /w9/[token]. Set when a W-9 request email is '
  'sent, cleared on successful upload. NULL means no live upload link.';
COMMENT ON COLUMN musicians.w9_uploaded_at IS
  'When the musician submitted their own W-9 through the tokenized link. NULL for '
  'W-9s the contractor uploaded on their behalf, so the two are distinguishable.';


-- ============================================================================
-- PART 2 — Remove four dead security rules
--
-- Migration 032 let musicians read and write their own folder in the
-- w9-documents bucket, identified by their login:
--
--   (storage.foldername(name))[1] = auth.uid()::text
--
-- Musicians no longer have logins, so auth.uid() is never a musician and these
-- four rules can never match anything. They are dead weight that reads like a
-- live grant, which is exactly the kind of thing that misleads a future reader.
--
-- The upload runs through the service role, which is not subject to these rules
-- at all, so removing them changes no behaviour.
--
-- "Admin read all W9" is deliberately KEPT — your W-9 download button needs it.
-- ============================================================================

DROP POLICY IF EXISTS "Musicians upload own W9" ON storage.objects;
DROP POLICY IF EXISTS "Musicians read own W9"   ON storage.objects;
DROP POLICY IF EXISTS "Musicians update own W9" ON storage.objects;
DROP POLICY IF EXISTS "Musicians delete own W9" ON storage.objects;


-- ============================================================================
-- RESULTS — read this table. Every row should say PASS.
-- ============================================================================

SELECT
  'Upload-link columns added' AS check,
  CASE WHEN (
    SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'musicians'
      AND column_name IN ('w9_request_token','w9_request_sent_at',
                          'w9_request_expires_at','w9_uploaded_at')
  ) = 4 THEN 'PASS - all 4 columns present'
    ELSE 'FAIL - some columns missing, tell Claude'
  END AS result

UNION ALL

SELECT
  'One musician per upload link',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'musicians'
      AND indexname = 'idx_musicians_w9_request_token'
  ) THEN 'PASS - unique index in place'
    ELSE 'FAIL - index missing, tell Claude'
  END

UNION ALL

SELECT
  'Dead musician-login rules removed',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND policyname IN ('Musicians upload own W9','Musicians read own W9',
                         'Musicians update own W9','Musicians delete own W9')
  ) THEN 'PASS - all four gone'
    ELSE 'FAIL - one is still present, tell Claude'
  END

UNION ALL

SELECT
  'Your W-9 download still works',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND policyname = 'Admin read all W9'
  ) THEN 'PASS - admin read policy intact'
    ELSE 'FAIL - the download policy is missing, tell Claude'
  END

UNION ALL

SELECT
  'Live upload links right now',
  COALESCE((
    SELECT count(*)::text FROM musicians WHERE w9_request_token IS NOT NULL
  ), '0') || ' (0 is expected until you send a W-9 request)';
