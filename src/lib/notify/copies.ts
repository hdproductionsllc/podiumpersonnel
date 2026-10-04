/**
 * Copies for the organization (David, 2026-10-04): every email Podium sends to
 * a musician is also sent to that organization's owners and admins, marked as
 * a copy, so the people running the company can see exactly what went out.
 *
 * What counts: the email types below, which are addressed to a musician (or a
 * suggested substitute). Notices addressed to the admins themselves (offer
 * expired, report submitted, pay summary, ...) are not copied: the admins
 * already receive those.
 *
 * The copy is the very email the musician got, with a banner on top. Its
 * personal links (accept, decline, report, W-9, confirm) are switched off,
 * because they act AS the musician: an admin tapping "Accept" in a copy would
 * accept the gig for them.
 *
 * Pure: no I/O. notify() sends the copy (see index.ts).
 */

/** email_logs.email_type values whose recipient is a musician. */
export const MUSICIAN_EMAIL_TYPES: ReadonlySet<string> = new Set([
  'contract_offer',
  'offer_reminder',
  'offer_reminder_auto',
  'offer_accepted',
  'offer_declined',
  'offer_rescinded',
  'position_unassigned',
  'musician_released',
  'sub_declined',
  'sub_request_approved',
  'sub_request_declined',
  'gig_details',
  'gig_details_reminder',
  'gig_report_request',
  'music_available',
  'music_reminder',
  'w9_request',
])

/** Paths whose links act as the musician (token pages and their API routes). */
const PERSONAL_LINK = /\/(gig|report|w9|confirm-details|confirm-music|api)\//

export interface CopyDetails {
  recipientName?: string | null
  recipientEmail: string
  subject: string
}

export function copySubject({ recipientName, recipientEmail, subject }: CopyDetails): string {
  return `Copy: ${subject} (sent to ${recipientName?.trim() || recipientEmail})`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Turn a personal link into plain, unclickable text; leave maps and other links alone. */
function disablePersonalLinks(html: string): string {
  return html.replace(/<a\b([^>]*?)\shref="([^"]*)"([^>]*)>/gi, (tag, before: string, href: string, after: string) =>
    PERSONAL_LINK.test(href) ? `<a${before}${after} title="Link sent to the musician">` : tag
  )
}

/** The musician's email with a "this is a copy" banner on top and its personal links switched off. */
export function copyHtml(html: string, details: CopyDetails): string {
  const who = details.recipientName?.trim()
    ? `${escapeHtml(details.recipientName.trim())} (${escapeHtml(details.recipientEmail)})`
    : escapeHtml(details.recipientEmail)
  const banner =
    `<div style="background:#fff7ed;border:1px solid #fdba74;border-radius:8px;padding:12px 16px;margin:16px auto;max-width:600px;` +
    `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:20px;color:#9a3412">` +
    `<strong>Copy for your records.</strong> Podium sent this email to ${who}. ` +
    `Its personal links (accept, decline, report, confirm) are switched off in this copy because they act as the musician.` +
    `</div>`
  const body = disablePersonalLinks(html)
  const bodyOpen = body.match(/<body\b[^>]*>/i)
  return bodyOpen ? body.replace(bodyOpen[0], `${bodyOpen[0]}${banner}`) : `${banner}${body}`
}
