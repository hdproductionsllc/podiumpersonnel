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

interface AdminOfferSentEmailProps {
  adminName?: string
  organizationName: string
  projectName: string
  musicianName: string
  musicianEmail: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  services: {
    name: string
    date: string
    time: string
    venue: string | null
  }[]
  dashboardUrl: string
}

export function AdminOfferSentEmail({
  adminName,
  organizationName,
  projectName,
  musicianName,
  musicianEmail,
  instrument,
  chairNumber,
  totalChairs,
  services,
  dashboardUrl,
}: AdminOfferSentEmailProps) {
  const showChair = totalChairs !== undefined ? totalChairs > 1 : true
  return (
    <Html>
      <Head />
      <Preview>
        Offer sent to {musicianName} for {projectName}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={heading}>{organizationName}</Text>
          </Section>

          <Section style={content}>
            <Section style={sentBanner}>
              <Text style={bannerIcon}>📤</Text>
              <Text style={bannerText}>Offer Sent</Text>
            </Section>

            {adminName && <Text style={greeting}>Hi {adminName},</Text>}

            <Text style={paragraph}>
              A contract offer has been sent to <strong>{musicianName}</strong> for:
            </Text>

            <Section style={detailsBox}>
              <Text style={detailsTitle}>{projectName}</Text>
              <Text style={detailsItem}>
                <strong>Position:</strong> {instrument}{showChair ? `, Chair ${chairNumber}` : ''}
              </Text>
              <Text style={detailsItem}>
                <strong>Musician:</strong> {musicianName} ({musicianEmail})
              </Text>
              <Text style={detailsItem}>
                <strong>Status:</strong>{' '}
                <span style={pendingText}>AWAITING RESPONSE</span>
              </Text>
            </Section>

            {services.length > 0 && (
              <>
                <Text style={sectionTitle}>Services included:</Text>
                <Section style={servicesBox}>
                  {services.map((service, index) => (
                    <Text key={index} style={serviceItem}>
                      • {service.name} - {service.date} at {service.time}
                      {service.venue && (
                        <>
                          {' ('}
                          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(service.venue)}`} style={{ color: '#1E293B', textDecoration: 'underline' }}>
                            {service.venue}
                          </a>
                          {')'}
                        </>
                      )}
                    </Text>
                  ))}
                </Section>
              </>
            )}

            <Text style={infoText}>
              You will be notified when the musician responds to this offer.
            </Text>

            <Section style={buttonContainer}>
              <Button style={button} href={dashboardUrl}>
                View in Dashboard
              </Button>
            </Section>
          </Section>

          <Hr style={hr} />

          <Section style={footer}>
            <Text style={footerText}>
              This notification was sent by Podium.
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

const sentBanner = {
  backgroundColor: '#dbeafe',
  border: '1px solid #1E293B',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '24px',
  textAlign: 'center' as const,
}

const bannerIcon = {
  fontSize: '28px',
  margin: '0 0 4px 0',
}

const bannerText = {
  fontSize: '18px',
  fontWeight: 'bold',
  margin: '0',
  color: '#1e40af',
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

const detailsBox = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '16px',
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

const pendingText = {
  color: '#d97706',
  fontWeight: 'bold',
}

const sectionTitle = {
  fontSize: '14px',
  fontWeight: 'bold',
  color: '#1a1a1a',
  marginBottom: '8px',
}

const servicesBox = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '12px 16px',
  marginBottom: '16px',
}

const serviceItem = {
  fontSize: '13px',
  color: '#525f7f',
  margin: '4px 0',
}

const infoText = {
  fontSize: '14px',
  color: '#6b7280',
  marginBottom: '16px',
  fontStyle: 'italic' as const,
}

const buttonContainer = {
  textAlign: 'center' as const,
  marginTop: '24px',
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

export default AdminOfferSentEmail
