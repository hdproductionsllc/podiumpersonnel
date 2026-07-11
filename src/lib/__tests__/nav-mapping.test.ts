/**
 * Freezes the fully-resolved default sidebar — label + route + emphasis for
 * each item, in order — against the exact pre-verticals `navigation` array.
 * vertical-identity.test.ts guards labels/order; this guards that mapping a
 * template's nav ids through NAV_ROUTES still produces the right hrefs, so a
 * mis-wired route (books → /dashboard/instruments) fails here, not in prod.
 */
import { describe, it, expect } from 'vitest'
import { resolveVertical, NAV_ROUTES, VERTICALS } from '@/lib/verticals'

// The literal the sidebar rendered before Phase 2 (icons excluded — visual).
const FROZEN_DEFAULT_SIDEBAR = [
  { name: 'Dashboard', href: '/dashboard', emphasize: false },
  { name: 'Projects', href: '/dashboard/projects', emphasize: true },
  { name: 'Musicians', href: '/dashboard/musicians', emphasize: false },
  { name: 'Saved Ensembles', href: '/dashboard/books', emphasize: false },
  { name: 'Payments', href: '/dashboard/payments', emphasize: false },
  { name: 'Venues', href: '/dashboard/venues', emphasize: false },
  { name: 'Instruments', href: '/dashboard/instruments', emphasize: false },
  { name: 'Sent Emails', href: '/dashboard/emails', emphasize: false },
]

// Mirrors exactly how SidebarNav derives its render list.
function renderNav(verticalKey: string | null) {
  return resolveVertical(verticalKey).nav.map(({ id, label, emphasize }) => ({
    name: label,
    href: NAV_ROUTES[id],
    emphasize: emphasize ?? false,
  }))
}

describe('sidebar nav mapping', () => {
  it('default vertical reproduces the pre-verticals sidebar exactly', () => {
    expect(renderNav('music_contractor')).toEqual(FROZEN_DEFAULT_SIDEBAR)
  })

  it('every nav id in every template resolves to a defined route', () => {
    for (const t of Object.values(VERTICALS)) {
      for (const item of t.nav) {
        expect(NAV_ROUTES[item.id]).toBeDefined()
        expect(NAV_ROUTES[item.id]).toMatch(/^\/dashboard/)
      }
    }
  })

  it('a relabeled vertical keeps the same routes (labels change, paths do not)', () => {
    const choir = renderNav('choir')
    const singers = choir.find((i) => i.name === 'Singers')
    const voiceParts = choir.find((i) => i.name === 'Voice Parts')
    expect(singers?.href).toBe('/dashboard/musicians')
    expect(voiceParts?.href).toBe('/dashboard/instruments')
  })

  it('event_agency omits the books tab', () => {
    expect(renderNav('event_agency').some((i) => i.href === '/dashboard/books')).toBe(false)
  })
})
