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
} from '@react-email/components'

interface OfferReminderEmailProps {
  musicianName: string
  organizationName: string
  projectName: string
  instrument: string
  chairNumber: number
  responseUrl: string
  expiresAt: string | null
  daysRemaining: number | null
}

export function OfferReminderEmail({
  musicianName,
  organizationName,
  projectName,
  instrument,
  chairNumber,
  responseUrl,
  expiresAt,
  daysRemaining,
}: OfferReminderEmailProps) {
  const urgentStyle = daysRemaining !== null && daysRemaining <= 2

  return (
    <Html>
      <Head />
      <Preview>
        Reminder: Contract offer for {projectName} expires soon
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={heading}>{organizationName}</Text>
          </Section>

          <Section style={content}>
            <Text style={greeting}>Dear {musicianName},</Text>

            <Text style={paragraph}>
              This is a friendly reminder that you have a pending contract offer from{' '}
              <strong>{organizationName}</strong> that requires your response.
            </Text>

            {urgentStyle && (
              <Section style={urgentBox}>
                <Text style={urgentText}>
                  ⚠️ This offer expires {daysRemaining === 0 ? 'today' : daysRemaining === 1 ? 'tomorrow' : `in ${daysRemaining} days`}!
                </Text>
              </Section>
            )}

            <Section style={detailsBox}>
              <Text style={detailsTitle}>{projectName}</Text>
              <Text style={detailsItem}>
                <strong>Position:</strong> {instrument}, Chair {chairNumber}
              </Text>
              {expiresAt && (
                <Text style={detailsItem}>
                  <strong>Response deadline:</strong>{' '}
                  {new Date(expiresAt).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </Text>
              )}
            </Section>

            <Section style={buttonContainer}>
              <Button style={button} href={responseUrl}>
                View & Respond to Offer
              </Button>
            </Section>

            <Text style={smallText}>
              Please respond at your earliest convenience to secure your position.
            </Text>
          </Section>

          <Hr style={hr} />

          <Section style={footer}>
            <Text style={footerText}>
              This email was sent by {organizationName} via Podium.
            </Text>
            <Text style={footerText}>
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
  backgroundColor: '#1a1a1a',
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

const footerText = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  textAlign: 'center' as const,
  marginBottom: '4px',
}

export default OfferReminderEmail
