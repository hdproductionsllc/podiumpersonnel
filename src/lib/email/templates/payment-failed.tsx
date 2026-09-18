import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
  Preview,
  Img,
  Link,
} from '@react-email/components'
import { type EmailBranding } from './email-layout'
import { PodiumFooter } from './podium-footer'

export interface PaymentFailedEmailProps {
  organizationName: string
  /** Pre-formatted for display, e.g. "$79.00" — Stripe amounts are minor units. */
  amountDue: string | null
  /** null when Stripe has no further retry scheduled (the invoice is finalized/void). */
  nextRetryDate: string | null
  /** Stripe's hosted invoice page — shown as a secondary link when present. */
  invoiceUrl: string | null
  /** Where "Update payment method" sends the org owner — the app's billing settings. */
  billingUrl: string
  branding?: EmailBranding
}

export function PaymentFailedEmail({
  organizationName,
  amountDue,
  nextRetryDate,
  invoiceUrl,
  billingUrl,
  branding,
}: PaymentFailedEmailProps) {
  const brandColor = branding?.brandColor || '#1E293B'
  const logoUrl = branding?.logoUrl
  const footerText = branding?.footerText

  return (
    <Html>
      <Head />
      <Preview>
        Action needed: a payment on your Podium subscription didn&apos;t go through
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={{ ...header, backgroundColor: brandColor }}>
            {logoUrl ? (
              <Img
                src={logoUrl}
                alt={organizationName}
                height="48"
                style={{ margin: '0 auto', maxWidth: '200px' }}
              />
            ) : (
              <Text style={heading}>{organizationName}</Text>
            )}
          </Section>

          <Section style={content}>
            <Text style={urgencyBadge}>Payment failed</Text>

            <Text style={greeting}>We couldn&apos;t process your payment</Text>

            <Text style={paragraph}>
              A payment on your Podium subscription for <strong>{organizationName}</strong> didn&apos;t
              go through. Your account is still active, but please update your payment method
              {nextRetryDate ? <> before the next retry so nothing is interrupted</> : <> to avoid any interruption</>}.
            </Text>

            <Section style={detailsBox}>
              {amountDue && (
                <Text style={detailsItem}>
                  <strong>Amount due:</strong> {amountDue}
                </Text>
              )}
              <Text style={detailsItem}>
                <strong>Next retry:</strong> {nextRetryDate || 'Not scheduled — update your payment method to retry now'}
              </Text>
              {invoiceUrl && (
                <Text style={detailsItem}>
                  <Link href={invoiceUrl} style={link}>
                    View the invoice
                  </Link>
                </Text>
              )}
            </Section>

            <Section style={buttonContainer}>
              <Button style={{ ...button, backgroundColor: brandColor }} href={billingUrl}>
                Update Payment Method
              </Button>
            </Section>

            <Text style={smallText}>
              Stripe will automatically retry this charge. If it keeps failing, your subscription
              may be paused until payment succeeds.
            </Text>
          </Section>

          <PodiumFooter organizationName={organizationName} footerText={footerText} verb="notification" />
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  maxWidth: '600px',
}

const header = {
  padding: '24px',
  textAlign: 'center' as const,
}

const heading = {
  color: '#ffffff',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '0',
  textAlign: 'center' as const,
}

const content = {
  padding: '24px',
}

const urgencyBadge = {
  color: '#ffffff',
  backgroundColor: '#dc2626',
  fontSize: '12px',
  fontWeight: 'bold',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  padding: '4px 10px',
  borderRadius: '4px',
  display: 'inline-block',
  marginBottom: '16px',
}

const greeting = {
  fontSize: '20px',
  fontWeight: 'bold',
  lineHeight: '28px',
  marginBottom: '16px',
  color: '#1E293B',
}

const paragraph = {
  fontSize: '14px',
  lineHeight: '22px',
  color: '#525f7f',
  marginBottom: '16px',
}

const detailsBox = {
  backgroundColor: '#f8fafc',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '16px',
  border: '1px solid #e2e8f0',
}

const detailsItem = {
  fontSize: '14px',
  color: '#334155',
  marginBottom: '6px',
  margin: '0 0 6px 0',
}

const link = {
  color: '#1E293B',
  textDecoration: 'underline',
}

const buttonContainer = {
  textAlign: 'center' as const,
  marginTop: '24px',
  marginBottom: '16px',
}

const button = {
  backgroundColor: '#1E293B',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '14px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 24px',
}

const smallText = {
  fontSize: '12px',
  color: '#8898aa',
  textAlign: 'center' as const,
}

export default PaymentFailedEmail
