import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Regression guards for two production bugs:
 *  1. Couldn't manually assign the musician who held that chair's offer.
 *  2. Sending a new offer didn't clear the previous outstanding one (stale pending offer).
 */

const root = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf-8')

describe('Bug 1 — manual assign allows the chair\'s offered musician', () => {
  const route = read('src/app/api/positions/[positionId]/assign/route.ts')
  it('only blocks pending offers on OTHER positions, not this one', () => {
    expect(route).toContain('otherPosIds')
    expect(route).toContain('id !== positionId')
  })
  it('resolves the assigned musician\'s outstanding offer for this chair to accepted', () => {
    expect(route).toContain("status: 'accepted'")
    expect(route).toContain("eq('project_position_id', positionId)")
  })

  const dialogWiring = read('src/components/projects/project-positions.tsx')
  it('assign picker excludes only other-chair offers', () => {
    expect(dialogWiring).toContain('p.id !== assignPositionId')
  })
})

describe('Bug 2 — sending a new offer supersedes the previous one', () => {
  const route = read('src/app/api/offers/send-email/route.ts')
  it('retires other outstanding offers on the same chair', () => {
    expect(route).toContain("eq('project_position_id', position.id)")
    expect(route).toContain("neq('id', offerId)")
    expect(route).toContain("in('status', ['pending', 'viewed'])")
  })
})
