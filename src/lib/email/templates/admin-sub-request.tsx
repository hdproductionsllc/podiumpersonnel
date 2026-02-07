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

interface AdminSubRequestEmailProps {
  adminName?: string
  organizationName: string
  projectName: string
  musicianName: string
  musicianEmail: string | null
  instrument: string
  chairNumber: number
  totalChairs?: number
  serviceName: string | null
  reason: string | null
  suggestedSubName: string
  suggestedSubEmail: string
  suggestedSubPhone: string | null
  suggestedSubInstrument: string
  dashboardUrl: string
}

export function AdminSubRequestEmail({
  organizationName,
  projectName,
  musicianName,
  instrument,
  chairNumber,
  totalChairs,
  serviceName,
  reason,
  suggestedSubName,
  suggestedSubEmail,
  suggestedSubPhone,
  suggestedSubInstrument,
  dashboardUrl,
}: AdminSubRequestEmailProps) {
  const showChair = totalChairs !== undefined ? totalChairs > 1 : true
  return (
    <Html>
      <Head />
      <Preview>
        Sub Request: {musicianName} needs a sub for {projectName}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={heading}>{organizationName}</Text>
          </Section>

          <Section style={content}>
            <Text style={alertBanner}>New Substitution Request</Text>

            <Text style={paragraph}>
              <strong>{musicianName}</strong> has requested a substitute for their position.
              This request requires your review and approval before the substitute is contacted.
            </Text>

            <Section style={detailsBox}>
              <Text style={detailsTitle}>Position Details</Text>
              <Text style={detailsItem}>
                <strong>Project:</strong> {projectName}
              </Text>
              <Text style={detailsItem}>
                <strong>Position:</strong> {instrument}{showChair ? `, Chair ${chairNumber}` : ''}
              </Text>
              <Text style={detailsItem}>
                <strong>Service:</strong> {serviceName || 'All services'}
              </Text>
              {reason && (
                <Text style={detailsItem}>
                  <strong>Reason:</strong> {reason}
                </Text>
              )}
            </Section>

            <Section style={suggestedSubBox}>
              <Text style={detailsTitle}>Suggested Substitute</Text>
              <Text style={detailsItem}>
                <strong>Name:</strong> {suggestedSubName}
              </Text>
              <Text style={detailsItem}>
                <strong>Email:</strong> {suggestedSubEmail}
              </Text>
              {suggestedSubPhone && (
                <Text style={detailsItem}>
                  <strong>Phone:</strong> {suggestedSubPhone}
                </Text>
              )}
              <Text style={detailsItem}>
                <strong>Instrument:</strong> {suggestedSubInstrument}
              </Text>
            </Section>

            <Section style={buttonContainer}>
              <Button style={button} href={dashboardUrl}>
                Review Request
              </Button>
            </Section>

            <Text style={smallText}>
              If you approve, the substitute will be added to your musician database and sent a contract offer.
              If you decline, the musician will be notified to find another substitute.
            </Text>
          </Section>

          <Hr style={hr} />

          <Section style={footer}>
            <Text style={footerText}>
              This notification was sent by Podium on behalf of {organizationName}.
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

const alertBanner = {
  backgroundColor: '#fef3c7',
  color: '#92400e',
  padding: '12px 16px',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: 'bold',
  textAlign: 'center' as const,
  marginBottom: '20px',
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
  marginBottom: '16px',
}

const suggestedSubBox = {
  backgroundColor: '#ecfdf5',
  border: '1px solid #a7f3d0',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '24px',
}

const detailsTitle = {
  fontSize: '14px',
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

export default AdminSubRequestEmail
