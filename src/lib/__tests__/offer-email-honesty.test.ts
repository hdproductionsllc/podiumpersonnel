import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * A declined chair was re-offered to the next musician. The offer row was
 * created, the screen said "Call sent!", and nothing else happened: no email in
 * Resend, no row in the email log, and the musician never heard about it.
 *
 * Two faults stacked up, and each one alone is enough to lose an offer:
 *
 *   1. The dialog decided whether a send was possible from `hasEmail`, computed
 *      off the `musicians` array the Projects page fetched server-side on load.
 *      That array never refreshes, so an address added afterwards — on the
 *      Musicians page, or in another tab — is absent here. `hasEmail` false
 *      skipped the fetch entirely, so the server was never even asked.
 *   2. The success toast fired on `sendEmail && hasEmail`, never on the result
 *      of the send. It announced a call that had not been sent, which is why
 *      the drop went unnoticed until the musician failed to appear.
 *
 * The server route already reads the musician's current address and returns a
 * plain 400 when there is none, so it is the only honest authority. These tests
 * hold the client to asking it and to repeating its answer faithfully.
 */

const root = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf-8')

describe('the send dialog asks the server rather than its stale copy', () => {
  const src = read('src/components/projects/send-offer-dialog.tsx')

  it('re-reads the selected musician email instead of trusting the page load', () => {
    expect(src).toContain("from('musicians')")
    expect(src).toMatch(/\.select\('email'\)[\s\S]{0,120}\.eq\('id', selectedMusicianId\)/)
  })

  it('does not gate the send on the locally-computed hasEmail', () => {
    expect(src).toContain('if (sendEmail && offerData?.id)')
    expect(src).not.toContain('if (sendEmail && hasEmail && offerData?.id)')
  })

  it('treats a non-OK response as a failure rather than a send', () => {
    expect(src).toContain('if (response.ok)')
    expect(src).toContain('emailSent = true')
    expect(src).toContain('emailFailure =')
  })
})

describe('the dialog never claims a call it did not send', () => {
  const src = read('src/components/projects/send-offer-dialog.tsx')

  it('gates the "Call sent" toast on the send having succeeded', () => {
    const claim = src.indexOf('Call sent to ${musicianName}')
    expect(claim, '"Call sent" toast not found').toBeGreaterThan(-1)

    // The toast must sit inside `if (emailSent)`, not inside a branch that only
    // knows email was switched on.
    const guard = src.lastIndexOf('if (emailSent) {', claim)
    expect(guard, '"Call sent" toast is not guarded by emailSent').toBeGreaterThan(-1)
    expect(src.slice(guard, claim)).not.toContain('}')
  })

  it('names the reason when no email went out', () => {
    expect(src).toContain('but NO email was sent:')
  })

  it('keeps a failed send away from the "has been sent the offer" view', () => {
    expect(src).toContain('if (emailFailure) {')
    const failureBranch = src.indexOf('if (emailFailure) {')
    const successView = src.indexOf('setShowSuccess(true)')
    expect(failureBranch).toBeLessThan(successView)
  })
})

describe('A6: a suppressed send is never reported as sent', () => {
  const routeSrc = read('src/app/api/offers/send-email/route.ts')
  const dialogSrc = read('src/components/projects/send-offer-dialog.tsx')

  it('route reads suppression off the send result, not off an error', () => {
    expect(routeSrc).toContain('result?.suppressed === true')
  })

  it('route logs the email_logs row as suppressed, not sent', () => {
    expect(routeSrc).toContain("status: suppressed ? 'suppressed' : 'sent'")
  })

  it('route tells the caller nothing was actually delivered', () => {
    expect(routeSrc).toContain('emailSent: false')
    expect(routeSrc).toContain('suppressed: true')
    expect(routeSrc).toContain('Email suppressed by safe mode')
  })

  it('route skips the admin "offer sent" notification when the send was suppressed', () => {
    const guard = routeSrc.indexOf('if (!suppressed) {')
    const adminSend = routeSrc.indexOf('sendAdminOfferSentEmail({')
    expect(guard, 'suppressed guard not found').toBeGreaterThan(-1)
    expect(adminSend, 'admin notification call not found').toBeGreaterThan(guard)
  })

  it('dialog reads the suppressed flag instead of trusting response.ok alone', () => {
    expect(dialogSrc).toContain('detail?.suppressed')
    expect(dialogSrc).toContain('emailSuppressed = true')
  })

  it('warns instead of claiming "Call sent!" when the send was suppressed', () => {
    const sentBranch = dialogSrc.indexOf('if (emailSent) {')
    const suppressedBranch = dialogSrc.indexOf('} else if (emailSuppressed) {')
    const failureBranch = dialogSrc.indexOf('} else if (emailFailure) {')
    expect(sentBranch, 'emailSent branch not found').toBeGreaterThan(-1)
    expect(suppressedBranch, 'emailSuppressed branch not found').toBeGreaterThan(sentBranch)
    expect(failureBranch, 'emailFailure branch not found').toBeGreaterThan(suppressedBranch)
    expect(dialogSrc.slice(suppressedBranch, failureBranch)).toContain('toast.warning(')
    expect(dialogSrc.slice(suppressedBranch, failureBranch)).toContain('safe mode is on')
  })
})

describe('a declined chair can be re-offered to someone not suggested', () => {
  const src = read('src/components/projects/project-offers.tsx')

  it('offers an explicit escape hatch from the two suggested names', () => {
    expect(src).toContain('Someone else…')
    expect(src).toContain('onSendWaterfall(offer.project_position_id, null, offer.custom_pay)')
  })

  it('still shows the row when the call order has run out of names', () => {
    // Previously the whole row was hidden on an empty candidate list, which left
    // no way at all to re-offer the chair from here.
    expect(src).not.toContain("waterfallCandidates[offer.project_position_id]?.length > 0 && (")
    expect(src).toContain('No one left in the call order for this chair:')
  })
})

describe('picking "Someone else" opens the dialog unpicked', () => {
  it('passes autoSelect through from the waterfall trigger', () => {
    const positions = read('src/components/projects/project-positions.tsx')
    expect(positions).toContain('setOfferAutoSelect(waterfallTrigger.musicianId !== null)')
    expect(positions).toContain('autoSelect={offerAutoSelect}')
  })

  it('skips the top-of-call-order auto-pick when autoSelect is off', () => {
    const dialog = read('src/components/projects/send-offer-dialog.tsx')
    expect(dialog).toContain('if (!autoSelect) return')
  })
})
