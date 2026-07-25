import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Route enforcement audit.
 *
 * Verifies every gated API route actually contains the expected plan check.
 * Catches accidental removal of billing gates during refactoring.
 */

const root = resolve(__dirname, '../../..')

function readRoute(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf-8')
}

describe('API route billing gates', () => {
  describe('routes gated with requireOrgPlan + canBulkImport', () => {
    it('musicians/import requires bulk import check', () => {
      const src = readRoute('src/app/api/musicians/import/route.ts')
      expect(src).toContain('requireOrgPlan')
      expect(src).toContain('canBulkImport')
      expect(src).toContain('403')
    })
  })

  describe('routes gated with getOrgPlan + canUseEmailFeatures', () => {
    const emailGatedRoutes = [
      'src/app/api/projects/[projectId]/send-gig-details/route.ts',
      'src/app/api/projects/[projectId]/send-gig-details-reminder/route.ts',
      'src/app/api/projects/[projectId]/send-music/route.ts',
      'src/app/api/projects/[projectId]/send-music-reminder/route.ts',
      'src/app/api/musicians/send-w9-request/route.ts',
    ]

    emailGatedRoutes.forEach((route) => {
      it(`${route} has email feature gate`, () => {
        const src = readRoute(route)
        expect(src).toContain('getOrgPlan')
        expect(src).toContain('canUseEmailFeatures')
        expect(src).toContain('403')
      })
    })
  })

  describe('routes gated with plan check + canAddMember', () => {
    it('settings/members requires member limit check', () => {
      const src = readRoute('src/app/api/settings/members/route.ts')
      expect(src).toContain('resolveOrgPlan')
      expect(src).toContain('canAddMember')
      expect(src).toContain('403')
    })
  })

  describe('routes that previously lacked auth', () => {
    it('next-candidates requires authentication', () => {
      const src = readRoute('src/app/api/positions/[positionId]/next-candidates/route.ts')
      expect(src).toContain('auth.getUser')
      expect(src).toContain('Unauthorized')
      expect(src).toContain('401')
    })

    it('auto-populate POST requires authentication', () => {
      const src = readRoute('src/app/api/projects/[projectId]/auto-populate/route.ts')
      expect(src).toContain('auth.getUser')
      expect(src).toContain('Unauthorized')
      expect(src).toContain('401')
    })

    it('file download checks org membership', () => {
      const src = readRoute('src/app/api/projects/[projectId]/files/[fileId]/download/route.ts')
      expect(src).toContain('organization_members')
      expect(src).toContain('Forbidden')
      expect(src).toContain('403')
    })
  })

  describe('plan gate routes require org membership (not silently skip)', () => {
    const planGatedRoutes = [
      'src/app/api/projects/[projectId]/send-gig-details/route.ts',
      'src/app/api/projects/[projectId]/send-gig-details-reminder/route.ts',
      'src/app/api/projects/[projectId]/send-music/route.ts',
      'src/app/api/projects/[projectId]/send-music-reminder/route.ts',
    ]

    planGatedRoutes.forEach((route) => {
      it(`${route} returns 403 when no org membership`, () => {
        const src = readRoute(route)
        expect(src).toContain('if (!mem)')
        expect(src).toContain('No organization found')
      })
    })
  })

  describe('offer routes must NOT be gated (core workflow, always free)', () => {
    const freeRoutes = [
      'src/app/api/offers/send-email/route.ts',
      'src/app/api/offers/send-reminder/route.ts',
    ]

    freeRoutes.forEach((route) => {
      it(`${route} is NOT gated by plan`, () => {
        const src = readRoute(route)
        expect(src).not.toContain('canUseEmailFeatures')
        expect(src).not.toContain('canBulkImport')
        expect(src).not.toContain('requireOrgPlan')
      })
    })
  })

  describe('webhook route handles all required Stripe events', () => {
    it('handles checkout.session.completed', () => {
      const src = readRoute('src/app/api/billing/webhook/route.ts')
      expect(src).toContain('checkout.session.completed')
    })

    it('handles customer.subscription.updated', () => {
      const src = readRoute('src/app/api/billing/webhook/route.ts')
      expect(src).toContain('customer.subscription.updated')
    })

    it('handles customer.subscription.deleted', () => {
      const src = readRoute('src/app/api/billing/webhook/route.ts')
      expect(src).toContain('customer.subscription.deleted')
    })

    it('verifies webhook signature', () => {
      const src = readRoute('src/app/api/billing/webhook/route.ts')
      expect(src).toContain('stripe-signature')
      expect(src).toContain('constructEvent')
    })
  })

  describe('checkout route has correct setup', () => {
    it('creates stripe customer and checkout session', () => {
      const src = readRoute('src/app/api/billing/checkout/route.ts')
      expect(src).toContain('customers.create')
      expect(src).toContain('checkout.sessions.create')
      expect(src).toContain('subscription')
      expect(src).toContain('organization_id')
    })

    it('requires org admin auth', () => {
      const src = readRoute('src/app/api/billing/checkout/route.ts')
      expect(src).toContain('requireOrgAdmin')
    })
  })

  describe('portal route has correct setup', () => {
    it('creates billing portal session', () => {
      const src = readRoute('src/app/api/billing/portal/route.ts')
      expect(src).toContain('billingPortal.sessions.create')
    })

    it('requires org admin auth', () => {
      const src = readRoute('src/app/api/billing/portal/route.ts')
      expect(src).toContain('requireOrgAdmin')
    })
  })
})

// Every plan-resolving org SELECT must include is_comped — omitting it makes
// resolveOrgPlan treat comped (founding) orgs as free (audit finding: comped
// orgs couldn't add team members because members/route.ts dropped the column).
import { describe as describeComped, it as itComped, expect as expectComped } from 'vitest'
import { readFileSync as readComped } from 'fs'
import { join as joinComped } from 'path'

describeComped('is_comped is selected wherever the plan is resolved', () => {
  const files = [
    'src/app/api/settings/members/route.ts',
    'src/lib/api-helpers.ts',
    'src/app/dashboard/layout.tsx',
  ]
  for (const f of files) {
    itComped(`${f} selects is_comped alongside billing columns`, () => {
      const src = readComped(joinComped(process.cwd(), f), 'utf8')
      const billingSelects = src.match(/select\(\s*'[^']*plan_tier[^']*'/g) || []
      expectComped(billingSelects.length).toBeGreaterThan(0)
      for (const sel of billingSelects) {
        expectComped(sel).toContain('is_comped')
      }
    })
  }
})
