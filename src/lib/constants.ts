/**
 * App-wide constants.
 */

/** Where users are directed for help when something goes wrong. Single source of truth. */
export const SUPPORT_EMAIL = 'support@podiumpersonnel.com'

/** Build a mailto link, optionally pre-filling the subject (e.g. with an error ID). */
export function supportMailto(subject?: string): string {
  return subject
    ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`
    : `mailto:${SUPPORT_EMAIL}`
}
