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

interface SubRequestDeclinedEmailProps {
  musicianName: string
  organizationName: string
  projectName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  serviceName: string | null
  suggestedSubName: string
  adminNotes: string | null
  gigUrl: string
}

export function SubRequestDeclinedEmail({
  musicianName,
  organizationName,
  projectName,
  instrument,
  chairNumber,
  totalChairs,
  serviceName,
  suggestedSubName,
  adminNotes,
  gigUrl,
}: SubRequestDeclinedEmailProps) {
  const showChair = totalChairs !== undefined ? totalChairs > 1 : true
  return (
    <Html>
      <Head />
      <Preview>
        Your sub request for {projectName} was declined - please find another substitute
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={heading}>{organizationName}</Text>
          </Section>

          <Section style={content}>
            <Text style={greeting}>Dear {musicianName},</Text>

            <Section style={warningBanner}>
              <Text style={warningText}>Your Sub Request Was Declined</Text>
            </Section>

            <Text style={paragraph}>
              Unfortunately, your substitution request suggesting <strong>{suggestedSubName}</strong> has been declined.
              You are still responsible for this engagement unless you find another suitable substitute.
            </Text>

            {adminNotes && (
              <Section style={notesBox}>
                <Text style={notesTitle}>Notes from Admin:</Text>
                <Text style={notesText}>{adminNotes}</Text>
              </Section>
            )}

            <Section style={detailsBox}>
              <Text style={detailsTitle}>{projectName}</Text>
              <Text style={detailsItem}>
                <strong>Position:</strong> {instrument}{showChair ? `, Chair ${chairNumber}` : ''}
              </Text>
              <Text style={detailsItem}>
                <strong>Service:</strong> {serviceName || 'All services'}
              </Text>
            </Section>

            <Text style={paragraph}>
              <strong>What should you do?</strong>
            </Text>
            <Text style={paragraph}>
              Please find another qualified substitute and submit a new request.
              Make sure your suggested substitute plays the correct instrument
              and is suitable for this engagement.
            </Text>

            <Section style={buttonContainer}>
              <Button style={button} href={gigUrl}>
                Submit New Sub Request
              </Button>
            </Section>
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

const warningBanner = {
  backgroundColor: '#fee2e2',
  padding: '16px',
  borderRadius: '8px',
  marginBottom: '20px',
}

const warningText = {
  color: '#991b1b',
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

const notesBox = {
  backgroundColor: '#fef3c7',
  border: '1px solid #fcd34d',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '16px',
}

const notesTitle = {
  fontSize: '13px',
  fontWeight: 'bold',
  color: '#92400e',
  marginBottom: '4px',
}

const notesText = {
  fontSize: '14px',
  color: '#78350f',
  margin: '0',
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
  backgroundColor: '#3b82f6',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '14px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 24px',
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

export default SubRequestDeclinedEmail
