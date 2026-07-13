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
} from '@react-email/components'
import { type EmailBranding } from './email-layout'
import { term, DEFAULT_TERMS, type TermDictionary } from '@/lib/verticals'

interface OfferReminderEmailProps {
  musicianName: string
  organizationName: string
  projectName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  responseUrl: string
  expiresAt: string | null
  daysRemaining: number | null
  branding?: EmailBranding
  terms?: TermDictionary
}

export function OfferReminderEmail({
  musicianName,
  organizationName,
  projectName,
  instrument,
  chairNumber,
  totalChairs,
  responseUrl,
  expiresAt,
  daysRemaining,
  branding,
  terms,
}: OfferReminderEmailProps) {
  const t = terms ?? DEFAULT_TERMS
  const urgentStyle = daysRemaining !== null && daysRemaining <= 2
  const showChair = totalChairs !== undefined ? totalChairs > 1 : true
  const brandColor = branding?.brandColor || '#f59e0b'
  const logoUrl = branding?.logoUrl
  const footerText = branding?.footerText

  return (
    <Html>
      <Head />
      <Preview>
        {projectName} - response still needed
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
              Just following up on the {instrument}{showChair ? ` ${term(t, 'rank', { case: 'lower' })} ${chairNumber}` : ''} for{' '}
              <strong>{projectName}</strong> with {organizationName} - we still need your response.
              {expiresAt && (
                <>
                  {' '}The deadline is{' '}
                  <strong>
                    {new Date(expiresAt).toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </strong>
                  {urgentStyle ? (daysRemaining === 0 ? ' (today)' : daysRemaining === 1 ? ' (tomorrow)' : '') : ''}.
                </>
              )}
            </Text>

            <Text style={paragraph}>
              You can view the details and respond here:{' '}
              <a href={responseUrl} style={{ color: brandColor, textDecoration: 'underline' }}>
                {responseUrl}
              </a>
            </Text>

            <Text style={paragraph}>
              Thanks,<br />
              {organizationName}
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

const urgentBox = {
  backgroundColor: '#fef3c7',
  border: '1px solid #f59e0b',
  borderRadius: '8px',
  padding: '12px 16px',
  marginBottom: '16px',
}

const urgentText = {
  fontSize: '14px',
  fontWeight: 'bold',
  color: '#92400e',
  margin: '0',
  textAlign: 'center' as const,
}

const detailsBox = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '24px',
}

const detailsTitle = {
  fontSize: '18px',
  fontWeight: 'bold',
  color: '#1a1a1a',
  marginBottom: '8px',
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
  backgroundColor: '#f59e0b',
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

export default OfferReminderEmail
