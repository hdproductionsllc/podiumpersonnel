import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Found by re-running a privilege-escalation attempt against a real database
 * rather than reading the policy and assuming.
 *
 * "Admins can update their organization" is UPDATE ... USING is_org_admin(id)
 * with no column restriction — RLS is row-level and cannot express one. The
 * browser talks to PostgREST directly, so an org admin could write ANY column on
 * their own organizations row:
 *
 *   UPDATE organizations SET is_comped = true WHERE id = <their own>;
 *     → permanent free Symphony. Defeats 080 entirely, since the caps are only
 *       as trustworthy as the columns they read.
 *
 *   UPDATE organizations SET library_org_id = <another org>, intake_enabled = true
 *     → resolveLibraryOrgId() reads library_org_id with the ADMIN client and
 *       returns it verbatim; every library route then scopes to it with the
 *       service client. That is read, download, and add-work WRITE access to
 *       another organization's entire catalogue.
 *
 * Both were confirmed to succeed before 081 and to fail after, on PostgreSQL 16.
 */

const root = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf-8')
const sql = read('supabase/migrations/081_protect_privileged_org_columns.sql')

describe('081 freezes the columns an org must not set for itself', () => {
  it('guards every billing column resolveOrgPlan reads', () => {
    // If any of these is writable, the tier is self-selectable and 080 is moot.
    for (const col of [
      'is_comped',
      'plan_tier',
      'subscription_status',
      'trial_ends_at',
      'stripe_customer_id',
      'stripe_subscription_id',
    ]) {
      expect(sql, `${col} not guarded`).toContain(`array_append(changed, '${col}')`)
    }
  })

  it('guards the library pointer and the intake flag', () => {
    // The catalogue is the most valuable thing in the product; this pair is the
    // difference between "my library" and "anyone's library".
    expect(sql).toContain("array_append(changed, 'library_org_id')")
    expect(sql).toContain("array_append(changed, 'intake_enabled')")
  })

  it('is SECURITY INVOKER, or the role check is meaningless', () => {
    // Under SECURITY DEFINER, current_user is rewritten to the function OWNER,
    // so the guard reads 'postgres' for every caller and waves everything
    // through. The first version of this migration did exactly that and looked
    // correct until the attack was re-run.
    // Anchored to the function attribute on its own line — the phrase also
    // appears in the comment above it explaining this exact trap.
    expect(sql).toMatch(/^SECURITY INVOKER$/m)
    expect(sql).not.toMatch(/^SECURITY DEFINER$/m)
  })

  it('lets the service role through, so the billing webhook still works', () => {
    expect(sql).toContain("current_user IN ('service_role', 'postgres', 'supabase_admin')")
  })

  it('fires on UPDATE of the row, not just on named columns', () => {
    // UPDATE OF <cols> would miss a column added to the guard list later.
    expect(sql).toContain('BEFORE UPDATE ON organizations')
    expect(sql).not.toMatch(/BEFORE UPDATE OF .* ON organizations/)
  })

  it('compares with IS DISTINCT FROM so unchanged values pass', () => {
    // A full-row update that re-sends the same values must not be rejected, or
    // ordinary settings saves start failing.
    expect(sql).toMatch(/IS DISTINCT FROM OLD\.is_comped/)
  })

  it('is re-runnable', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION')
    expect(sql).toContain('DROP TRIGGER IF EXISTS')
  })
})

describe('the app still writes these the legitimate way', () => {
  it('the billing webhook uses the admin client', () => {
    // Service role, so the trigger lets it through. If this ever became a
    // user-scoped client, subscriptions would silently stop applying.
    const webhook = read('src/app/api/billing/webhook/route.ts')
    expect(webhook).toContain('createAdminClient')
  })

  it('the settings route never touches a guarded column', () => {
    const settings = read('src/app/api/settings/organization/route.ts')
    const update = settings.slice(settings.indexOf('.update({'), settings.indexOf('.eq(\'id\''))
    for (const col of ['is_comped', 'plan_tier', 'subscription_status', 'library_org_id', 'intake_enabled']) {
      expect(update, `settings writes guarded column ${col}`).not.toContain(col)
    }
  })

  it('resolveLibraryOrgId still trusts the column — which is why it is frozen', () => {
    // Documents the coupling: the trigger is what makes this read safe.
    const helpers = read('src/lib/api-helpers.ts')
    expect(helpers).toContain('library_org_id')
    expect(helpers).toContain('createAdminClient')
  })
})
