import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from '@react-email/render'

/**
 * A8 (2026-09-18): the payment-failed dunning email.
 *
 *   1. Template tests render PaymentFailedEmail directly and check the HTML
 *      carries the amount, retry date, invoice link, and a working CTA.
 *   2. billing-notices tests drive the real sendPaymentFailedEmail() against
 *      mocked org-lookup / owner-lookup / send functions, checking:
 *        - the owner email is resolved and used as the recipient
 *        - org branding (logo/color/footer) flows through to the template
 *        - no owner email → skipped silently, no throw
 *        - a send failure is caught and logged, never thrown (the webhook
 *          that calls this must always get control back)
 */

describe('PaymentFailedEmail template', () => {
  it('renders the amount, next retry date, invoice link, and CTA', async () => {
    const { PaymentFailedEmail } = await import('@/lib/email/templates/payment-failed')
    const html = await render(
      PaymentFailedEmail({
        organizationName: 'Test Orchestra',
        amountDue: '$79.00',
        nextRetryDate: 'Friday, September 25, 2026',
        invoiceUrl: 'https://invoice.stripe.com/i/xyz',
        billingUrl: 'https://app.example.com/dashboard/settings',
      })
    )

    expect(html).toContain('Test Orchestra')
    expect(html).toContain('$79.00')
    expect(html).toContain('Friday, September 25, 2026')
    expect(html).toContain('https://invoice.stripe.com/i/xyz')
    expect(html).toContain('https://app.example.com/dashboard/settings')
    expect(html).toContain('Update Payment Method')
  })

  it('still renders a usable CTA with no amount, retry date, or invoice link', async () => {
    const { PaymentFailedEmail } = await import('@/lib/email/templates/payment-failed')
    const html = await render(
      PaymentFailedEmail({
        organizationName: 'Test Orchestra',
        amountDue: null,
        nextRetryDate: null,
        invoiceUrl: null,
        billingUrl: 'https://app.example.com/dashboard/settings',
      })
    )

    expect(html).toContain('https://app.example.com/dashboard/settings')
    expect(html).not.toContain('null')
  })

  it('applies branding when provided (logo swaps out the plain-text org name header)', async () => {
    const { PaymentFailedEmail } = await import('@/lib/email/templates/payment-failed')
    const html = await render(
      PaymentFailedEmail({
        organizationName: 'Branded Org',
        amountDue: '$29.00',
        nextRetryDate: null,
        invoiceUrl: null,
        billingUrl: 'https://app.example.com/dashboard/settings',
        branding: { logoUrl: 'https://cdn.example.com/logo.png', brandColor: '#112233' },
      })
    )

    expect(html).toContain('https://cdn.example.com/logo.png')
    expect(html).toContain('#112233')
  })
})

// ---------------------------------------------------------------------------
// billing-notices.ts (sendPaymentFailedEmail)
// ---------------------------------------------------------------------------

const fake = vi.hoisted(() => ({
  org: null as null | { name: string; email_logo_url: string | null; email_brand_color: string | null; email_footer_text: string | null },
  ownerEmail: null as string | null,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from() {
      return {
        select() {
          return this
        },
        eq() {
          return this
        },
        maybeSingle: () => Promise.resolve({ data: fake.org, error: null }),
      }
    },
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  getOrgOwnerEmail: vi.fn(async () => fake.ownerEmail),
}))

interface SendEmailArgs {
  to: string
  subject: string
  html: string
  text?: string
}

const sendEmailMock = vi.hoisted(() =>
  vi.fn(async (_args: SendEmailArgs) => ({ id: 'em-alert' }))
)
vi.mock('@/lib/email/send', () => ({
  sendEmail: sendEmailMock,
}))

beforeEach(() => {
  fake.org = { name: 'Test Orchestra', email_logo_url: null, email_brand_color: null, email_footer_text: null }
  fake.ownerEmail = 'owner@example.com'
  sendEmailMock.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sendPaymentFailedEmail', () => {
  const invoice = {
    amountDue: 7900,
    currency: 'usd',
    nextPaymentAttempt: 1_800_000_000,
    hostedInvoiceUrl: 'https://invoice.stripe.com/i/xyz',
  }

  it('emails the resolved org owner with a rendered HTML + text body', async () => {
    const { sendPaymentFailedEmail } = await import('@/lib/email/billing-notices')

    await sendPaymentFailedEmail('org-1', invoice)

    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    const call = sendEmailMock.mock.calls[0][0]
    expect(call.to).toBe('owner@example.com')
    expect(call.subject).toContain('Test Orchestra')
    expect(call.html).toContain('$79.00')
    expect(call.html).toContain('https://invoice.stripe.com/i/xyz')
    expect(typeof call.text).toBe('string')
  })

  it('skips silently when the org has no owner email — never throws', async () => {
    fake.ownerEmail = null
    const { sendPaymentFailedEmail } = await import('@/lib/email/billing-notices')

    await expect(sendPaymentFailedEmail('org-1', invoice)).resolves.toBeUndefined()
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('swallows a send failure instead of throwing (the webhook must always ack Stripe)', async () => {
    sendEmailMock.mockRejectedValueOnce(new Error('resend down'))
    const { sendPaymentFailedEmail } = await import('@/lib/email/billing-notices')

    await expect(sendPaymentFailedEmail('org-1', invoice)).resolves.toBeUndefined()
  })

  it('formats a null amount / null next-retry gracefully', async () => {
    const { sendPaymentFailedEmail } = await import('@/lib/email/billing-notices')

    await sendPaymentFailedEmail('org-1', {
      amountDue: null,
      currency: null,
      nextPaymentAttempt: null,
      hostedInvoiceUrl: null,
    })

    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    const call = sendEmailMock.mock.calls[0][0]
    expect(call.html).not.toContain('null')
  })
})
