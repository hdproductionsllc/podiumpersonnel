-- 081: Stop org admins from writing their own billing and library columns
--
-- "Admins can update their organization" is UPDATE ... USING is_org_admin(id)
-- with no WITH CHECK and no column restriction, so an org admin could write ANY
-- column on their own organizations row straight through PostgREST. Two of those
-- columns decide things the org is not supposed to decide for itself.
--
-- 1. BILLING. is_comped / plan_tier / subscription_status / trial_ends_at are
--    what resolveOrgPlan() and 080's triggers read to pick a tier. An admin
--    could run
--        UPDATE organizations SET is_comped = true WHERE id = <their own>;
--    and hold permanent free Symphony. Verified against a real database: the
--    update succeeded and org_plan_tier() immediately returned 'symphony' with
--    an unlimited performer cap. That defeats 080 entirely — the caps are only
--    as trustworthy as the columns they read.
--
-- 2. THE MUSIC LIBRARY. library_org_id says whose repertoire this org reads and
--    writes. resolveLibraryOrgId() reads it with the ADMIN client (RLS bypassed)
--    and returns it verbatim; every library route then scopes to it with the
--    service client. So
--        UPDATE organizations
--           SET library_org_id = <someone else's org>, intake_enabled = true
--         WHERE id = <their own>;
--    hands the attacker another organization's entire catalogue — browse,
--    preview, download, and add-work writes land there too. Also verified: the
--    update succeeded and both columns changed.
--
-- Neither is reachable through the app's own UI; both are reachable by anyone
-- who opens devtools, because the client talks to PostgREST directly.
--
-- These columns are owned by the billing webhook and by whoever provisions a
-- shared library — both of which use the service role. So: writable by the
-- service role, frozen for everyone else. RLS is left alone; this is a
-- column-level rule, which RLS cannot express.

-- SECURITY INVOKER (the default) is REQUIRED here, not an oversight. Under
-- SECURITY DEFINER, current_user is rewritten to the function's OWNER, so the
-- role check below would read 'postgres' for every caller and wave everything
-- through — which is exactly what the first version of this migration did, and
-- it silently passed until the attack was re-run against a real database. The
-- function touches no tables, so it needs no elevated rights.
CREATE OR REPLACE FUNCTION protect_privileged_org_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  changed TEXT[] := '{}';
BEGIN
  -- The service role (billing webhook, provisioning, migrations) is exactly who
  -- SHOULD be setting these. Everything else — anon, authenticated — is not.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.is_comped              IS DISTINCT FROM OLD.is_comped              THEN changed := array_append(changed, 'is_comped'); END IF;
  IF NEW.plan_tier              IS DISTINCT FROM OLD.plan_tier              THEN changed := array_append(changed, 'plan_tier'); END IF;
  IF NEW.subscription_status    IS DISTINCT FROM OLD.subscription_status    THEN changed := array_append(changed, 'subscription_status'); END IF;
  IF NEW.trial_ends_at          IS DISTINCT FROM OLD.trial_ends_at          THEN changed := array_append(changed, 'trial_ends_at'); END IF;
  IF NEW.stripe_customer_id     IS DISTINCT FROM OLD.stripe_customer_id     THEN changed := array_append(changed, 'stripe_customer_id'); END IF;
  IF NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id THEN changed := array_append(changed, 'stripe_subscription_id'); END IF;
  IF NEW.library_org_id         IS DISTINCT FROM OLD.library_org_id         THEN changed := array_append(changed, 'library_org_id'); END IF;
  IF NEW.intake_enabled         IS DISTINCT FROM OLD.intake_enabled         THEN changed := array_append(changed, 'intake_enabled'); END IF;

  IF array_length(changed, 1) > 0 THEN
    RAISE EXCEPTION
      'These fields are managed by Podium and cannot be changed directly: %',
      array_to_string(changed, ', ')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_privileged_org_columns ON organizations;
CREATE TRIGGER trg_protect_privileged_org_columns
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION protect_privileged_org_columns();

COMMENT ON FUNCTION protect_privileged_org_columns() IS
  'Freezes billing and library-pointer columns on organizations against every role '
  'except the service role. The admin UPDATE policy is row-level and cannot express '
  'a column restriction, so this trigger carries it.';

-- ---------------------------------------------------------------------------
-- verify
-- ---------------------------------------------------------------------------
-- Trigger installed. Expect 1 row.
-- SELECT tgname FROM pg_trigger WHERE tgname = 'trg_protect_privileged_org_columns';

-- Nobody has quietly pointed their library somewhere else already. Every row
-- returned is an org reading ANOTHER org's catalogue — expect only the shares
-- you set up yourself.
-- SELECT o.name AS reader, l.name AS reads_library_of
-- FROM organizations o JOIN organizations l ON l.id = o.library_org_id
-- WHERE o.library_org_id IS DISTINCT FROM o.id;

-- Nobody has quietly comped themselves. Expect only orgs you comped.
-- SELECT name, is_comped, plan_tier, subscription_status
-- FROM organizations WHERE is_comped OR subscription_status IS NOT NULL;
