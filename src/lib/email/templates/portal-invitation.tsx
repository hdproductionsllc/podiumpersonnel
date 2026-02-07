import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Hr,
  Preview,
  Img,
  Button,
} from '@react-email/components'
import { type EmailBranding } from './email-layout'

interface PortalInvitationEmailProps {
  musicianName: string
  organizationName: string
  activationUrl: string
  expiresAt: string
  branding?: EmailBranding
}

export function PortalInvitationEmail({
  musicianName,
  organizationName,
  activationUrl,
  expiresAt,
  branding,
}: PortalInvitationEmailProps) {
  const brandColor = branding?.brandColor || '#1E293B'
  const logoUrl = branding?.logoUrl
  const footerText = branding?.footerText

  const expirationDate = new Date(expiresAt).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <Html>
      <Head />
      <Preview>
        {organizationName} has invited you to join the Podium Musician Portal
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
            <Text style={greeting}>Hi {musicianName},</Text>

            <Text style={paragraph}>
              <strong>{organizationName}</strong> has added you to their roster on Podium
              and invited you to activate your musician portal account.
            </Text>

            <Section style={benefitsBox}>
              <Text style={benefitsTitle}>With the Podium Musician Portal, you can:</Text>
              <Text style={benefitItem}>&#10003; View and respond to contract offers in one place</Text>
              <Text style={benefitItem}>&#10003; See your schedule across all organizations</Text>
              <Text style={benefitItem}>&#10003; Manage your availability and profile</Text>
              <Text style={benefitItem}>&#10003; Get notified about new opportunities</Text>
            </Section>

            <Section style={buttonContainer}>
              <Button style={{ ...button, backgroundColor: brandColor }} href={activationUrl}>
                Activate Your Account
              </Button>
            </Section>

            <Text style={smallText}>
              This invitation link will expire on {expirationDate}.
            </Text>

            <Text style={smallText}>
              If you already have a Podium account, you can link this musician profile
              to your existing account during activation.
            </Text>
          </Section>

          <Hr style={hr} />

          <Section style={footer}>
            {footerText && (
              <Text style={footerTextStyle}>{footerText}</Text>
            )}
            <Text style={footerTextStyle}>
              This email was sent by {organizationName} via Podium.
            </Text>
            <Text style={footerTextStyle}>
              If you have questions, please contact the organization directly.
            </Text>
          </Section>
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

const greeting = {
  fontSize: '16px',
  lineHeight: '24px',
  marginBottom: '16px',
}

const paragraph = {
  fontSize: '14px',
  lineHeight: '22px',
  color: '#525f7f',
  marginBottom: '16px',
}

const benefitsBox = {
  backgroundColor: '#f0fdf4',
  border: '1px solid #22c55e',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '24px',
}

const benefitsTitle = {
  fontSize: '14px',
  fontWeight: 'bold',
  color: '#166534',
  marginBottom: '12px',
}

const benefitItem = {
  fontSize: '14px',
  color: '#166534',
  marginBottom: '6px',
  paddingLeft: '8px',
}

const buttonContainer = {
  textAlign: 'center' as const,
  marginTop: '24px',
  marginBottom: '16px',
}

const button = {
  borderRadius: '6px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 32px',
}

const smallText = {
  fontSize: '12px',
  color: '#8898aa',
  textAlign: 'center' as const,
  marginBottom: '8px',
}

const hr = {
  borderColor: '#e6ebf1',
  margin: '20px 0',
}

const footer = {
  padding: '0 24px',
}

const footerTextStyle = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  textAlign: 'center' as const,
  marginBottom: '4px',
}

export default PortalInvitationEmail
