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

interface SubRequestApprovedEmailProps {
  musicianName: string
  organizationName: string
  projectName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  serviceName: string | null
  suggestedSubName: string
}

export function SubRequestApprovedEmail({
  musicianName,
  organizationName,
  projectName,
  instrument,
  chairNumber,
  totalChairs,
  serviceName,
  suggestedSubName,
}: SubRequestApprovedEmailProps) {
  const showChair = totalChairs !== undefined ? totalChairs > 1 : true
  return (
    <Html>
      <Head />
      <Preview>
        We&apos;re reaching out to {suggestedSubName} about subbing for {projectName}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={heading}>{organizationName}</Text>
          </Section>

          <Section style={content}>
            <Text style={greeting}>Dear {musicianName},</Text>

            <Section style={progressBanner}>
              <Text style={progressText}>Contacting Your Suggested Substitute</Text>
            </Section>

            <Text style={paragraph}>
              Good news — we&apos;ve approved your suggestion of <strong>{suggestedSubName}</strong> and
              are now reaching out to see if they&apos;re available for this engagement.
            </Text>

            <Section style={detailsBox}>
              <Text style={detailsTitle}>{projectName}</Text>
              <Text style={detailsItem}>
                <strong>Position:</strong> {instrument}{showChair ? `, Chair ${chairNumber}` : ''}
              </Text>
              <Text style={detailsItem}>
                <strong>Service:</strong> {serviceName || 'All services'}
              </Text>
              <Text style={detailsItem}>
                <strong>Suggested Sub:</strong> {suggestedSubName}
              </Text>
            </Section>

            <Text style={paragraph}>
              <strong>What happens next?</strong>
            </Text>
            <Text style={paragraph}>
              Your suggested substitute will receive a contract offer email. If they accept,
              you&apos;ll be released from this engagement and receive a confirmation email.
              If they decline, we&apos;ll notify you so you can suggest another substitute.
            </Text>

            <Text style={smallText}>
              Please don&apos;t make any other commitments for this date until you receive
              confirmation that your substitute has accepted.
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

// Styles
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

const progressBanner = {
  backgroundColor: '#dbeafe',
  padding: '16px',
  borderRadius: '8px',
  marginBottom: '20px',
}

const progressText = {
  color: '#1e40af',
  fontSize: '16px',
  fontWeight: 'bold',
  textAlign: 'center' as const,
  margin: '0',
}

const paragraph = {
  fontSize: '14px',
  lineHeight: '22px',
  color: '#525f7f',
  marginBottom: '16px',
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

const smallText = {
  fontSize: '12px',
  color: '#8898aa',
  textAlign: 'center' as const,
  fontStyle: 'italic',
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

export default SubRequestApprovedEmail
