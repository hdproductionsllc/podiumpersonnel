import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Hr,
  Preview,
} from '@react-email/components'

interface OfferRescindedEmailProps {
  musicianName: string
  organizationName: string
  projectName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
}

export function OfferRescindedEmail({
  musicianName,
  organizationName,
  projectName,
  instrument,
  chairNumber,
  totalChairs,
}: OfferRescindedEmailProps) {
  const showChair = totalChairs !== undefined ? totalChairs > 1 : true
  return (
    <Html>
      <Head />
      <Preview>
        Your offer for {projectName} has been withdrawn
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={heading}>{organizationName}</Text>
          </Section>

          <Section style={content}>
            <Text style={greeting}>Dear {musicianName},</Text>

            <Text style={paragraph}>
              The contract offer you received for <strong>{projectName}</strong> &mdash;{' '}
              <strong>{instrument}{showChair ? `, Chair ${chairNumber}` : ''}</strong> &mdash;{' '}
              has been withdrawn by {organizationName}. No response is needed from you, and the offer link will no longer be active.
            </Text>

            <Text style={paragraph}>
              If you have any questions, you can reach {organizationName} by replying to this email.
            </Text>

            <Text style={signOff}>
              Best regards,<br />
              {organizationName}
            </Text>
          </Section>

          <Hr style={hr} />

          <Section style={footer}>
            <Text style={footerText}>
              This email was sent by {organizationName} via Podium.
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

const signOff = {
  fontSize: '14px',
  lineHeight: '22px',
  color: '#525f7f',
  marginTop: '24px',
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

export default OfferRescindedEmail
