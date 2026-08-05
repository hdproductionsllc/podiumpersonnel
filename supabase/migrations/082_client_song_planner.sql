-- 082: Client song planner (tokenized, no account)
--
-- The owner's wedding clients fill a 17hats questionnaire; an admin pastes the
-- text and 069's parser reads it. This replaces that round-trip: the client gets
-- a tokenized link and builds the song list themselves, and the matcher runs on
-- every save, so by the time the operator opens the intake it is mostly resolved
-- instead of untranscribed.
--
-- Additive only. Seven nullable columns and one partial unique index on `intakes`.
-- No existing column, constraint or policy is touched, so every flow that works
-- today keeps working with this applied and the planner code not yet deployed.
--
-- `intakes.source` already permits 'client-form' (069) — the table was designed
-- expecting this — so nothing about the source CHECK changes either.

-- ---------------------------------------------------------------------------
-- 1. Token + client-side progress
-- ---------------------------------------------------------------------------
--   Token: 256 bits, generated in the app with randomBytes(32) exactly as 078's
--   W-9 upload token and contract_offers.token are. NOT defaulted: a token only
--   exists once a link is actually created, so an intake nobody was invited to
--   has no live page.
--
--   Progress is carried by TIMESTAMPS, deliberately, not by a new status value —
--   see the note under section 2.
ALTER TABLE intakes
  ADD COLUMN IF NOT EXISTS client_token             TEXT,
  ADD COLUMN IF NOT EXISTS client_token_expires_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_link_sent_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_due_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_opened_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_submitted_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_last_reminder_at  TIMESTAMPTZ;

-- One intake per token, and the index the /plan/[token] lookup reads. Partial so
-- the many NULLs (every intake without a live link) cost nothing and do not
-- collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS idx_intakes_client_token
  ON intakes(client_token)
  WHERE client_token IS NOT NULL;

COMMENT ON COLUMN intakes.client_token IS
  'Single-intake planner token for /plan/[token]. Set when the operator creates '
  'a link, re-minted on resend (which kills the old link), cleared on revoke. '
  'NULL means no live client page.';
COMMENT ON COLUMN intakes.client_submitted_at IS
  'When the CLIENT submitted their list. Non-NULL = the list is locked to the '
  'client; the operator clears it to reopen. Distinct from confirmed_at, which '
  'is the OPERATOR''s book-readiness gate and is untouched by this feature.';

-- ---------------------------------------------------------------------------
-- 2. Why there is no new `status` value
-- ---------------------------------------------------------------------------
--   intakes.status is CHECK-constrained to ('draft','confirmed') and the book
--   route gates on status <> 'confirmed'. A third value would have to be taught
--   to that gate and to every read that assumes two states — a real chance of
--   letting an unconfirmed intake build books. So status keeps meaning exactly
--   what it means today, and the client's progress composes from timestamps:
--
--     not sent          client_token IS NULL
--     sent, untouched   token set, client_opened_at IS NULL
--     in progress       client_opened_at set, client_submitted_at IS NULL
--     submitted/locked  client_submitted_at set
--     reopened          operator clears client_submitted_at
--
--   All five are derivable in SQL, none of them can confuse the book gate.

-- ---------------------------------------------------------------------------
-- 3. Row Level Security — deliberately unchanged
-- ---------------------------------------------------------------------------
--   No policy is added for `anon`. The public page and its save/submit endpoints
--   resolve the token and then read/write through the SERVICE client, the same
--   shape /gig/[token] and /w9/[token] already use. Migration 076 removed the
--   last USING (true) policies from this database; none come back here.
--
--   069's four policies (members read, admins write, on both intakes and
--   intake_songs) continue to be the only way an authenticated session reaches
--   these rows.

-- ===========================================================================
-- verify: the seven columns exist. Expect 7 rows.
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'intakes'
--    AND column_name LIKE 'client\_%'
--  ORDER BY column_name;

-- verify: the token index is unique AND partial. Expect one row whose indexdef
-- contains both 'UNIQUE' and 'WHERE (client_token IS NOT NULL)'.
-- SELECT indexdef FROM pg_indexes
--  WHERE schemaname = 'public' AND indexname = 'idx_intakes_client_token';

-- verify: no live planner links yet (nothing created since the migration).
-- Expect 0.
-- SELECT count(*) FROM intakes WHERE client_token IS NOT NULL;

-- verify: the status CHECK is untouched — still exactly two values.
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'intakes'::regclass AND conname LIKE '%status%';
-- Expected: CHECK ((status = ANY (ARRAY['draft'::text, 'confirmed'::text])))

-- verify: RLS policy count on intakes is unchanged. Expect 2.
-- SELECT count(*) FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'intakes';

-- ops: revoke a live planner link by hand (replace the uuid).
-- UPDATE intakes SET client_token = NULL, client_token_expires_at = NULL
--  WHERE project_id = '<project-uuid>';
