import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Preview,
  Img,
  Button,
} from '@react-email/components'
import { type EmailBranding } from './email-layout'
import { PodiumFooter } from './podium-footer'
import { term, DEFAULT_TERMS, type TermDictionary } from '@/lib/verticals'

interface PortalInvitationEmailProps {
  musicianName: string
  organizationName: string
  activationUrl: string
  expiresAt: string
  branding?: EmailBranding
  terms?: TermDictionary
}

export function PortalInvitationEmail({
  musicianName,
  organizationName,
  activationUrl,
  expiresAt,
  branding,
  terms,
}: PortalInvitationEmailProps) {
  const t = terms ?? DEFAULT_TERMS
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
        {organizationName} has invited you to join the Podium {term(t, 'person')} Portal
      </Preview>
      <Body style={main}>
        <Container style={container}>
          {logoUrl && (
            <Section style={header}>
              <Img
                src={logoUrl}
                alt={organizationName}
                height="40"
                style={{ margin: '0 auto', maxWidth: '160px' }}
              />
            </Section>
          )}

          <Section style={content}>
            <Text style={greeting}>Hi {musicianName},</Text>

            <Text style={paragraph}>
              <strong>{organizationName}</strong> added you to their {term(t, 'person', { case: 'lower' })} roster on Podium.
              You can activate your portal account to view and respond to offers, see your
              schedule, and manage your availability across organizations.
            </Text>

            <Text style={paragraph}>
              Activate your account here:{' '}
              <a href={activationUrl} style={{ color: brandColor, textDecoration: 'underline', wordBreak: 'break-all' }}>
                {activationUrl}
              </a>
            </Text>

            <Text style={paragraph}>
              The link expires on {expirationDate}. If you already have a Podium account,
              you can link this {term(t, 'person', { case: 'lower' })} profile to it during activation.
            </Text>
          </Section>

          <PodiumFooter
            organizationName={organizationName}
            footerText={footerText}
          />
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

export default PortalInvitationEmail
