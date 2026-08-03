import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Dialogs used to scroll sideways.
 *
 * DialogContent is a CSS grid, and a grid item's default `min-width: auto`
 * refuses to shrink below its content. One wide row — a long filename sitting
 * next to fixed-width controls — pushed the whole dialog past its max-width, so
 * you had to scroll left and right to reach the buttons. `overflow-y-auto`
 * forces `overflow-x` to `auto` per spec, which is why it scrolled rather than
 * clipping, and why nothing looked broken until you tried to click Cancel.
 *
 * Measured in headless Chromium against the real class structure:
 *
 *   viewport 1280px:  +229px overflow  →  0
 *   viewport  768px:  +229px overflow  →  0
 *   viewport  390px:  +351px overflow  →  0
 *
 * and the add-work filename went from 38px wide on a phone (truncated past the
 * point of telling two parts apart) to 278px.
 */

const root = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf-8')

describe('DialogContent lets its children shrink', () => {
  const src = read('src/components/ui/dialog.tsx')

  it('allows grid children to shrink below their content width', () => {
    // The whole fix. Without it every dialog in the app can be widened past its
    // max-width by any single wide descendant.
    expect(src).toContain('[&>*]:min-w-0')
  })

  it('is still a width-capped grid, so the fix stays necessary and sufficient', () => {
    expect(src).toContain('grid')
    expect(src).toMatch(/max-w-\[calc\(100%-2rem\)\]/)
    expect(src).toContain('sm:max-w-lg')
  })

  it('does not clip instead of fixing the cause', () => {
    // overflow-x-hidden would hide the symptom and silently cut off any
    // genuinely wide child (a table, a long token) with no way to reach it.
    expect(src).not.toContain('overflow-x-hidden')
  })
})

describe('the add-work file rows stay readable when narrow', () => {
  const src = read('src/components/intake/add-work-dialog.tsx')

  it('gives the filename its own line below the sm breakpoint', () => {
    // The part select, status and remove button take ~260px of fixed width.
    expect(src).toContain('w-full sm:w-auto sm:flex-1 min-w-0 truncate')
    expect(src).toContain('flex flex-wrap items-center')
  })

  it('keeps the full name reachable when truncated', () => {
    expect(src).toContain('title={row.file.name}')
  })
})

describe('no table can widen its page', () => {
  it('every table sits inside a horizontal scroll container', () => {
    // A table is content-sized, so an unwrapped one widens the page itself
    // rather than scrolling within its own box.
    const files = [
      'src/components/library/library-client.tsx',
      'src/components/musicians/musicians-client.tsx',
      'src/components/emails/emails-client.tsx',
    ]
    for (const f of files) {
      const src = read(f)
      if (!src.includes('<table')) continue
      expect(src, `${f} has a table with no overflow-x container`).toMatch(
        /overflow-x-auto|overflow-auto|overflow-x-scroll/
      )
    }
  })
})
