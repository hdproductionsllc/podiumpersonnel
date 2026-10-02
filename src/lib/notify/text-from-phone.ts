import { term, type TermDictionary } from '@/lib/verticals'

/**
 * "Text from my phone": the admin texts a person about an offer from their
 * own phone. Podium never sends a text: this builds a short message and an
 * sms: link that opens the device's messaging app with it filled in, and the
 * admin presses send (or doesn't). On a desktop, or with no number on file,
 * the admin copies the message instead.
 *
 * Pure and browser-safe: no server imports (the notify index imports the
 * email log, so client code imports this file directly).
 */

export type DevicePlatform = 'ios' | 'android' | 'desktop'

export type OfferTextKind =
  /** An offer still waiting for an answer. */
  | 'offer'
  /** An accepted offer: "here are the details again". */
  | 'confirmed'

export interface OfferTextInput {
  kind: OfferTextKind
  terms: TermDictionary
  /** The person's first name. */
  firstName: string
  organizationName: string
  /** The project (gig, production, event) as the admin named it. */
  projectName: string
  /** First call or service start, ISO. Null when the project has none yet. */
  startsAt: string | null
  /** The organization's time zone, so the date is the day it happens there. */
  timezone: string
  /** What they would do: "Violin, Chair 2", "Lighting". */
  role: string
  /** The person's own offer page (/gig/<token>). */
  link: string
}

/** "Sat, Nov 7", in the organization's time zone. Null when unknown or unreadable. */
export function formatTextDate(iso: string | null, timezone: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  try {
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: timezone })
  } catch {
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
  }
}

/**
 * The message, short enough for one or two text bubbles. Uses the
 * organization's vertical for the role word ("Instrument", "Voice Part",
 * "Role"), so a crew company never reads "Instrument".
 */
export function offerTextMessage(input: OfferTextInput): string {
  const first = input.firstName.trim()
  const greeting = first ? `Hi ${first}, it's ${input.organizationName}.` : `Hi, it's ${input.organizationName}.`
  const date = formatTextDate(input.startsAt, input.timezone)
  const when = date ? ` on ${date}` : ''
  const roleLabel = term(input.terms, 'skill')
  if (input.kind === 'confirmed') {
    return `${greeting} You're confirmed for ${input.projectName}${when} (${input.role}). All the details: ${input.link}`
  }
  return `${greeting} Are you available for ${input.projectName}${when}? ${roleLabel}: ${input.role}. Details and reply here: ${input.link}`
}

/** Which messaging app form to use, from the browser's user agent. */
export function detectPlatform(userAgent: string | null | undefined): DevicePlatform {
  const ua = userAgent || ''
  // iPadOS 13+ reports itself as a Mac; touch support is checked by the caller.
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

/**
 * A phone number fit for an sms: link: digits only, with a leading + kept for
 * an international number. Null when there are not enough digits to be a number.
 */
export function smsPhone(raw: string | null | undefined): string | null {
  const trimmed = (raw || '').trim()
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) return null
  return trimmed.startsWith('+') ? `+${digits}` : digits
}

/**
 * The sms: link that opens the messaging app with the message filled in.
 * iOS takes `sms:<number>&body=`; Android (and the RFC 5724 form) takes
 * `sms:<number>?body=`. The body is percent-encoded, so spaces, line breaks,
 * "&" and "?" in a project name survive. Null on a desktop or with no usable
 * number: copy the message instead.
 */
export function smsHref(phone: string | null | undefined, body: string, platform: DevicePlatform): string | null {
  if (platform === 'desktop') return null
  const number = smsPhone(phone)
  if (!number) return null
  const encoded = encodeURIComponent(body)
  return platform === 'ios' ? `sms:${number}&body=${encoded}` : `sms:${number}?body=${encoded}`
}

/** What the Text button does: open the messaging app, or copy the message. Never sends. */
export type TextAction = { kind: 'open'; href: string; message: string } | { kind: 'copy'; message: string }

export function textAction(
  input: OfferTextInput & { phone: string | null | undefined; platform: DevicePlatform }
): TextAction {
  const message = offerTextMessage(input)
  const href = smsHref(input.phone, message, input.platform)
  return href ? { kind: 'open', href, message } : { kind: 'copy', message }
}
