import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { VERTICALS } from '@/lib/verticals'
import {
  detectPlatform,
  formatTextDate,
  offerTextMessage,
  smsHref,
  smsPhone,
  textAction,
  type OfferTextInput,
} from '@/lib/notify/text-from-phone'

/**
 * "Text from my phone" (owner decision, Release 2): Podium builds a short
 * message and an sms: link; the admin's own phone sends it, or not. Nothing
 * here, or in the button, sends anything.
 */

const LINK = 'https://app.podiumpersonnel.com/gig/tok123'

const input = (over: Partial<OfferTextInput> = {}): OfferTextInput => ({
  kind: 'offer',
  terms: VERTICALS.music_contractor.terms,
  firstName: 'Sam',
  organizationName: 'Podium Quartet',
  projectName: 'Smith Wedding',
  // 7pm Saturday Nov 7 in New York is already Sunday in UTC.
  startsAt: '2026-11-08T00:00:00Z',
  timezone: 'America/New_York',
  role: 'Violin, Chair 2',
  link: LINK,
  ...over,
})

describe('the message', () => {
  it('a quartet offer reads in music words, dated in the organization time zone', () => {
    expect(offerTextMessage(input())).toBe(
      "Hi Sam, it's Podium Quartet. Are you available for Smith Wedding on Sat, Nov 7? " +
        `Instrument: Violin, Chair 2. Details and reply here: ${LINK}`
    )
  })

  it.each([
    ['choir', 'Voice Part'],
    ['theatre', 'Role'],
    ['church_worship', 'Team Role'],
    ['event_agency', 'Skill'],
  ] as const)('%s uses its own word for the role (%s)', (vertical, word) => {
    const message = offerTextMessage(input({ terms: VERTICALS[vertical].terms, role: 'Alto' }))
    expect(message).toContain(`${word}: Alto.`)
    expect(message).not.toContain('Instrument')
  })

  it('an accepted offer gets the "details" variant', () => {
    expect(offerTextMessage(input({ kind: 'confirmed' }))).toBe(
      `Hi Sam, it's Podium Quartet. You're confirmed for Smith Wedding on Sat, Nov 7 (Violin, Chair 2). All the details: ${LINK}`
    )
  })

  it('leaves out what it does not know, without leaving gaps', () => {
    const message = offerTextMessage(input({ firstName: '  ', startsAt: null }))
    expect(message).toBe(
      `Hi, it's Podium Quartet. Are you available for Smith Wedding? Instrument: Violin, Chair 2. Details and reply here: ${LINK}`
    )
    expect(formatTextDate('not a date', 'America/New_York')).toBeNull()
  })

  it('stays short: one or two text bubbles', () => {
    expect(offerTextMessage(input()).length).toBeLessThan(200)
  })
})

describe('the sms: link', () => {
  const body = 'Hi Sam & co? 50% off\nline two'

  it('iOS: sms:<number>&body=, percent-encoded', () => {
    expect(smsHref('(555) 123-4567', body, 'ios')).toBe(
      'sms:5551234567&body=Hi%20Sam%20%26%20co%3F%2050%25%20off%0Aline%20two'
    )
  })

  it('Android: sms:<number>?body=, percent-encoded', () => {
    expect(smsHref('555.123.4567', body, 'android')).toBe(
      'sms:5551234567?body=Hi%20Sam%20%26%20co%3F%2050%25%20off%0Aline%20two'
    )
  })

  it('keeps a leading + for an international number', () => {
    expect(smsPhone('+44 7700 900123')).toBe('+447700900123')
    expect(smsHref('+1 555 123 4567', 'x', 'ios')).toBe('sms:+15551234567&body=x')
  })

  it('the body round-trips exactly', () => {
    const message = offerTextMessage(input({ projectName: 'Gala & Ball? #1' }))
    const href = smsHref('5551234567', message, 'android')!
    expect(decodeURIComponent(href.slice(href.indexOf('?body=') + '?body='.length))).toBe(message)
  })

  it('no link on a desktop, or without a usable number', () => {
    expect(smsHref('5551234567', 'x', 'desktop')).toBeNull()
    expect(smsHref(null, 'x', 'ios')).toBeNull()
    expect(smsHref('12345', 'x', 'android')).toBeNull()
    expect(smsHref('   ', 'x', 'ios')).toBeNull()
  })

  it('detects the platform from the user agent', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('ios')
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 15; Pixel 9)')).toBe('android')
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop')
    expect(detectPlatform(undefined)).toBe('desktop')
  })
})

describe('the button: open the messaging app, or copy the message', () => {
  it('on a phone with a number on file, opens the messaging app', () => {
    const action = textAction({ ...input(), phone: '555-123-4567', platform: 'ios' })
    expect(action.kind).toBe('open')
    if (action.kind === 'open') {
      expect(action.href.startsWith('sms:5551234567&body=')).toBe(true)
      expect(action.message).toBe(offerTextMessage(input()))
    }
  })

  it('on a desktop, copies the message', () => {
    expect(textAction({ ...input(), phone: '555-123-4567', platform: 'desktop' })).toEqual({
      kind: 'copy',
      message: offerTextMessage(input()),
    })
  })

  it('with no phone number, copies the message', () => {
    expect(textAction({ ...input(), phone: null, platform: 'android' }).kind).toBe('copy')
  })

  it('never sends anything: no network call in the builder or the button', () => {
    const root = resolve(__dirname, '../../..')
    for (const path of ['src/lib/notify/text-from-phone.ts', 'src/components/projects/offer-text-button.tsx']) {
      const src = readFileSync(resolve(root, path), 'utf-8')
      expect(src, path).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|\/api\/|createClient|supabase/)
    }
  })

  it('the offers table shows it only on an offer still waiting for an answer', () => {
    const src = readFileSync(resolve(__dirname, '../../components/projects/project-offers.tsx'), 'utf-8')
    expect(src).toMatch(/\{isLiveOffer\(offer\) && projectName && \(\s*<OfferTextButton/)
    expect(src.match(/<OfferTextButton/g)).toHaveLength(1)
  })
})
