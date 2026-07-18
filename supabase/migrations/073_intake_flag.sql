-- 073: Intake / Book Builder feature flag (internal-only)
--
-- Gates the intake questionnaire → review → Book Builder pipeline behind a
-- per-org boolean. The feature is internal-only for now; no org sees it until
-- this flag is flipped on for them by hand.
--
-- Safe to apply anytime: additive, defaulted false. Both the API gate
-- (requireIntakeEnabled) and the dashboard read fail CLOSED — an unapplied
-- migration or a false flag hides the feature and returns 404, never leaks it.
-- Apply BEFORE deploying the gated code.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS intake_enabled BOOLEAN NOT NULL DEFAULT false;

-- ops: turn the feature on for a specific org (replace the uuid).
-- UPDATE organizations SET intake_enabled = true WHERE id = '<org-uuid>';

-- verify: which orgs have intake enabled.
-- SELECT id, name, intake_enabled FROM organizations WHERE intake_enabled = true;
