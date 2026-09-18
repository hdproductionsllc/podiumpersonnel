import { render } from '@react-email/render'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgOwnerEmail } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'
import { getAppUrl } from '@/lib/utils'
import { serverError } from '@/lib/api-helpers'
import { PaymentFailedEmail, type PaymentFailedEmailProps } from '@/lib/email/templates/payment-failed'

/**
 * Dunning email for `invoice.payment_failed` (A8, 2026-09-18 hardening).
 *
 * Before this, a failed Stripe charge only flipped `subscription_status` to
 * `past_due` in the database — the org owner never heard about it unless they
 * happened to check the dashboard. Stripe itself retries the charge on its own
 * schedule, but nothing told the human who could actually fix it (update a
 * card) that anything was wrong.
 *
 * Deliberately does NOT use `sendTransactional` from `send.ts` — that helper
 * isn't exported (send.ts is owned by another workstream in this pass), and
 * `sendEmail` already gives us the same safe-mode gate, List-Unsubscribe
 * headers, and plain-text alternative via `@react-email/render`.
 *
 * Never throws: the webhook's job is to record the Stripe event durably, not
 * to fail Stripe's delivery over an email hiccup. A failure here is logged and
 * captured to Sentry via `serverError` (its 500 response is discarded — this
 * isn't a request handler, just borrowing the same capture-and-log shape every
 * other server failure in the app uses) rather than thrown.
 */
export async function sendPaymentFailedEmail(
  orgId: string,
  invoice: {
    amountDue: number | null
    currency: string | null
    /** Unix seconds, or null when Stripe has no further retry scheduled. */
    nextPaymentAttempt: number | null
    hostedInvoiceUrl: string | null
  },
): Promise<void> {
  try {
    const adminClient = createAdminClient()
    const [{ data: org }, ownerEmail] = await Promise.all([
      adminClient
        .from('organizations')
        .select('name, email_logo_url, email_brand_color, email_footer_text')
        .eq('id', orgId)
        .maybeSingle(),
      getOrgOwnerEmail(orgId),
    ])

    if (!ownerEmail) {
      console.warn(`sendPaymentFailedEmail: no owner email found for org ${orgId} — skipping alert`)
      return
    }

    const organizationName = org?.name || 'Your Organization'
    const props: PaymentFailedEmailProps = {
      organizationName,
      amountDue: formatAmount(invoice.amountDue, invoice.currency),
      nextRetryDate: formatRetryDate(invoice.nextPaymentAttempt),
      invoiceUrl: invoice.hostedInvoiceUrl,
      billingUrl: `${getAppUrl()}/dashboard/settings`,
      branding: {
        logoUrl: org?.email_logo_url,
        brandColor: org?.email_brand_color,
        footerText: org?.email_footer_text,
      },
    }

    const react = PaymentFailedEmail(props)
    const [html, text] = await Promise.all([
      render(react),
      render(react, { plainText: true }),
    ])

    await sendEmail({
      to: ownerEmail,
      subject: `Action needed: payment failed for ${organizationName}`,
      html,
      text,
    })
  } catch (error) {
    // Logged + captured to Sentry; response is intentionally discarded — see
    // the doc comment above.
    serverError(`billing-webhook:payment-failed:${orgId}`, error)
  }
}

function formatAmount(amountMinor: number | null, currency: string | null): string | null {
  if (amountMinor == null || !currency) return null
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amountMinor / 100)
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency.toUpperCase()}`
  }
}

function formatRetryDate(unixSeconds: number | null): string | null {
  if (unixSeconds == null) return null
  try {
    return new Date(unixSeconds * 1000).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return null
  }
}
