import type { NavItemId } from './types'

/**
 * Canonical route for each nav item id. Routes are STABLE across every vertical
 * — templates change only labels/order/visibility, never the underlying path
 * (a choir's "Voice Parts" tab still links to /dashboard/instruments). Kept in
 * a plain module (not the client sidebar) so the mapping stays unit-testable.
 */
export const NAV_ROUTES: Record<NavItemId, string> = {
  dashboard: '/dashboard',
  projects: '/dashboard/projects',
  musicians: '/dashboard/musicians',
  books: '/dashboard/books',
  payments: '/dashboard/payments',
  venues: '/dashboard/venues',
  instruments: '/dashboard/instruments',
  emails: '/dashboard/emails',
}
