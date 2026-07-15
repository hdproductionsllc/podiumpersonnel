-- 071: Books approval gate (Book Builder Phase C4 — owner's pipeline)
--
-- The owner's workflow: confirm the client selections → assemble + DOWNLOAD the
-- books → review them by eye → APPROVE ("these books all look good and are
-- ready to send") → only then assign to musicians and send out.
--
-- This column records that approval. NULL = not approved. It is deliberately
-- cleared by EVERY save of the intake (draft or confirm): approval blesses the
-- exact confirmed list it was given on — any later edit invalidates it and the
-- books must be re-reviewed.
--
-- Additive only: one nullable column on intakes; existing rows untouched.

ALTER TABLE intakes
  ADD COLUMN books_approved_at TIMESTAMPTZ;

-- ===========================================================================
-- verify: column exists, nullable timestamptz, no default
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name = 'intakes'
--    AND column_name = 'books_approved_at';
-- Expected: one row — timestamp with time zone, YES, NULL default.

-- verify: no existing intake is pre-approved
-- SELECT count(*) FROM intakes WHERE books_approved_at IS NOT NULL;
-- Expected: 0.
