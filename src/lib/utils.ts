import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Default timezone when an organization has no timezone configured */
export const DEFAULT_TIMEZONE = 'America/Los_Angeles'

/** Human-readable timezone label, e.g. "Pacific (PDT)" */
export function formatTimezoneLabel(tz: string): string {
  try {
    const abbr = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(new Date())
      .find(p => p.type === 'timeZoneName')?.value || tz
    // Map IANA region to friendly name
    const friendly: Record<string, string> = {
      'America/Los_Angeles': 'Pacific',
      'America/Denver': 'Mountain',
      'America/Chicago': 'Central',
      'America/New_York': 'Eastern',
      'America/Anchorage': 'Alaska',
      'Pacific/Honolulu': 'Hawaii',
    }
    const name = friendly[tz]
    return name ? `${name} (${abbr})` : abbr
  } catch {
    return tz
  }
}

/** Default brand color for email templates */
export const DEFAULT_BRAND_COLOR = '#1E293B'

/** Base URL for the application, used in emails and links */
export function getAppUrl(): string {
  // trim: a stray trailing newline in the env var must not leak into URLs
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').trim()
}

/**
 * Escape text for interpolation into a hand-built HTML email body.
 *
 * React templates escape for us; the string-concatenated notifications do not.
 * Anywhere a person's own words reach an `html:` string — a client's note, a
 * name they typed — they go through here first, or a stray `<` breaks the email
 * and a deliberate one writes markup into the operator's inbox.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
