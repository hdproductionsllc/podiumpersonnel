-- 077: One organization per account, enforced by the database
--
-- The product rule is that an account belongs to exactly one organization, and
-- the code already depends on it: ~38 API routes resolve the caller's org with
--
--   .from('organization_members').select(...).eq('user_id', user.id).single()
--
-- PostgREST's .single() returns NO row when the query matches two, so an account
-- with a second membership gets "No organization found" from every one of them.
-- The dashboard shell picks the first membership instead, which makes the
-- failure quiet rather than loud: the dashboard renders and looks healthy while
-- every action inside it errors.
--
-- Until now the rule was only enforced in application code — the /onboarding
-- redirect, and (as of the previous commit) the member-invite guard. Both are
-- correct, but they are the kind of check a future route can forget. The
-- existing UNIQUE(organization_id, user_id) does not help: it permits one row
-- PER ORG, which is exactly the two rows that cause the breakage.
--
-- This makes the database the authority. A future code path that tries to
-- create a second membership now fails loudly on insert instead of silently
-- bricking someone's account.
--
-- NOTE: this migration is intentionally strict — it ABORTS if the table already
-- violates the rule, rather than guessing which membership to discard. Choosing
-- for someone could remove an owner from the org they actually run. See the
-- remediation query below if it stops.

-- 1. Refuse to proceed if any account already holds two memberships, and name
--    them in the error so the operator can act without hunting.
DO $$
DECLARE
  v_offenders TEXT;
  v_count     INT;
BEGIN
  SELECT count(*), string_agg(user_id::text || ' (' || n || ' orgs)', ', ')
    INTO v_count, v_offenders
  FROM (
    SELECT user_id, count(*) AS n
    FROM organization_members
    GROUP BY user_id
    HAVING count(*) > 1
  ) dupes;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Cannot add UNIQUE(user_id): % account(s) belong to more than one organization: %',
      v_count, v_offenders
      USING HINT =
        'Decide which membership each account keeps, delete the others, then re-run. '
        'Inspect with: SELECT om.user_id, om.organization_id, om.role, o.name '
        'FROM organization_members om JOIN organizations o ON o.id = om.organization_id '
        'WHERE om.user_id IN (SELECT user_id FROM organization_members '
        'GROUP BY user_id HAVING count(*) > 1) ORDER BY om.user_id, om.created_at;';
  END IF;
END $$;

-- 2. One membership per account.
--
--    This subsumes the existing UNIQUE(organization_id, user_id) — a user_id
--    unique across the table cannot repeat within an org either. The older
--    constraint is left in place deliberately: it is referenced by name in
--    nothing, but dropping it would be an irreversible change with no benefit,
--    and keeping it costs one small index.
ALTER TABLE organization_members
  DROP CONSTRAINT IF EXISTS organization_members_user_id_key;

ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_user_id_key UNIQUE (user_id);

COMMENT ON CONSTRAINT organization_members_user_id_key ON organization_members IS
  'One account = one organization. ~38 API routes resolve the caller org via '
  '.single() on this table, which returns nothing when it matches two rows, so a '
  'second membership silently breaks that account. Enforced here so no code path '
  'can violate the rule quietly.';
