import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Preview,
  Img,
} from '@react-email/components'
import { type EmailBranding } from './email-layout'
import { PodiumFooter } from './podium-footer'
import { type TermDictionary } from '@/lib/verticals'

interface GigDetailsReminderEmailProps {
  musicianName: string
  organizationName: string
  projectName: string
  services: {
    name: string
    date: string
    venue: string | null
    venue2?: string | null
  }[]
  confirmUrl: string
  originalSentDate: string
  branding?: EmailBranding
  terms?: TermDictionary
}

export function GigDetailsReminderEmail({
  musicianName,
  organizationName,
  projectName,
  services,
  confirmUrl,
  originalSentDate,
  branding,
}: GigDetailsReminderEmailProps) {
  const brandColor = branding?.brandColor || '#1E293B'
  const logoUrl = branding?.logoUrl
  const footerText = branding?.footerText

  return (
    <Html>
      <Head />
      <Preview>
        Reminder: Please confirm — {projectName}
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
              Just following up - we still need your confirmation for <strong>{projectName}</strong>.
            </Text>

            {services.map((service, index) => (
              <Text key={index} style={detailsItem}>
                {service.name} - {service.date}{service.venue ? ` at ${service.venue}` : ''}{service.venue2 ? ` & ${service.venue2}` : ''}
              </Text>
            ))}

            <Text style={paragraph}>
              Confirm here:{' '}
              <a href={confirmUrl} style={{ color: brandColor, textDecoration: 'underline', wordBreak: 'break-all' }}>
                {confirmUrl}
              </a>
            </Text>

            <Text style={paragraph}>
              Full details were sent on {originalSentDate}. Questions? Just reply to this email.
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

const detailsItem = {
  fontSize: '14px',
  color: '#525f7f',
  marginBottom: '4px',
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

export default GigDetailsReminderEmail
