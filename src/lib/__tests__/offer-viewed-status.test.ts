import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * "Viewed" is meant to answer one question: has the musician read their call?
 *
 * The dashboard offers a "View" button on every offer row, described as "View
 * offer as [musician] sees it", and it opens `/gig/[token]` — the very page that
 * flips a pending offer to "viewed" and stamps `viewed_at`. Nothing told the two
 * readers apart, so an admin checking on an offer marked it read on the
 * musician's behalf.
 *
 * That surfaced while chasing an offer whose email never sent: the chair read as
 * "viewed" for a musician who had never been sent anything to view.
 *
 * A staff member who is also the musician on the offer is the genuine reader,
 * and still marks it.
 */

const root = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf-8')

describe('an admin preview does not mark an offer viewed', () => {
  const src = read('src/app/gig/[token]/page.tsx')

  it('checks for an organization session before marking', () => {
    expect(src).toContain('isOrgStaffPreviewing')
    expect(src).toContain("from('organization_members')")
  })

  it('gates the viewed write on that check', () => {
    expect(src).toContain('if (!staffPreview) {')

    const guard = src.indexOf('if (!staffPreview) {')
    const write = src.indexOf("status: 'viewed'")
    expect(guard, 'staff-preview guard not found').toBeGreaterThan(-1)
    expect(write, 'viewed write not found').toBeGreaterThan(guard)
  })

  it('still marks it when the viewer is the offer\'s own musician', () => {
    expect(src).toContain('if (musicianUserId && user.id === musicianUserId) return false')
  })

  it('marks it as before when nobody is logged in', () => {
    // The common case: a token link opened from email, with no session at all.
    expect(src).toContain('if (!user) return false')
  })

  it('does not let a failed membership check block the page', () => {
    expect(src).toContain("console.warn('gig page: could not determine whether staff is previewing:', err)")
    expect(src).toMatch(/catch \(err\)[\s\S]{0,400}?return false/)
  })
})
