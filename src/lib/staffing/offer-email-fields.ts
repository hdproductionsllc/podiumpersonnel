/**
 * The organization and service fields the offer email reads. In their own
 * dependency-free file so read-only code (cascade-plan.ts, and through it the
 * preview script) can select the same columns without loading the email stack.
 * offer-email.ts re-exports both.
 */

/** The organization fields the email reads (branding, timezone). */
export const OFFER_EMAIL_ORG_FIELDS = 'id, name, timezone, email_logo_url, email_brand_color, email_footer_text'

/** The service fields the email reads (times, venues, base pay and leader fee). */
export const OFFER_EMAIL_SERVICE_FIELDS =
  'id, name, service_type, call_time, start_time, end_time, venue, venue_id, base_pay, leader_fee, venue_2, venue_id_2'
