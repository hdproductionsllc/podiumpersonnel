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

interface ContractOfferEmailProps {
  musicianName: string
  organizationName: string
  projectName: string
  instrument: string
  chairNumber: number
  services: {
    name: string
    date: string
    time: string
    venue: string | null
  }[]
  responseUrl: string
  expiresAt: string | null
  notes?: string | null
}

export function ContractOfferEmail({
  musicianName,
  organizationName,
  projectName,
  instrument,
  chairNumber,
  services,
  responseUrl,
  expiresAt,
  notes,
}: ContractOfferEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Contract offer for {projectName} - {instrument}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={heading}>{organizationName}</Text>
          </Section>

          <Section style={content}>
            <Text style={greeting}>Dear {musicianName},</Text>

            <Text style={paragraph}>
              You have been offered a position with <strong>{organizationName}</strong> for the following project:
            </Text>

            <Section style={detailsBox}>
              <Text style={detailsTitle}>{projectName}</Text>
              <Text style={detailsItem}>
                <strong>Position:</strong> {instrument}, Chair {chairNumber}
              </Text>
              {expiresAt && (
                <Text style={detailsItem}>
                  <strong>Please respond by:</strong> {new Date(expiresAt).toLocaleDateString()}
                </Text>
              )}
            </Section>

            <Text style={sectionTitle}>Services:</Text>
            <Section style={servicesTable}>
              {services.map((service, index) => (
                <Section key={index} style={serviceRow}>
                  <Text style={serviceName}>{service.name}</Text>
                  <Text style={serviceDetail}>
                    {service.date} at {service.time}
                  </Text>
                  {service.venue && (
                    <Text style={serviceVenue}>{service.venue}</Text>
                  )}
                </Section>
              ))}
            </Section>

            {notes && (
              <>
                <Text style={sectionTitle}>Additional Notes:</Text>
                <Text style={paragraph}>{notes}</Text>
              </>
            )}

            <Section style={buttonContainer}>
              <Button style={button} href={responseUrl}>
                View & Respond to Offer
              </Button>
            </Section>

            <Text style={smallText}>
              Click the button above to view the full details and accept or decline this offer.
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

const sectionTitle = {
  fontSize: '14px',
  fontWeight: 'bold',
  color: '#1a1a1a',
  marginBottom: '12px',
}

const servicesTable = {
  marginBottom: '24px',
}

const serviceRow = {
  backgroundColor: '#f8fafc',
  borderLeft: '3px solid #3b82f6',
  padding: '12px 16px',
  marginBottom: '8px',
}

const serviceName = {
  fontSize: '14px',
  fontWeight: 'bold',
  color: '#1a1a1a',
  margin: '0 0 4px 0',
}

const serviceDetail = {
  fontSize: '13px',
  color: '#525f7f',
  margin: '0 0 2px 0',
}

const serviceVenue = {
  fontSize: '13px',
  color: '#64748b',
  margin: '0',
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

export default ContractOfferEmail
