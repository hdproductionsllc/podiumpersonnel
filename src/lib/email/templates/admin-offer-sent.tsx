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
    callTime?: string | null
    time: string
    endTime?: string | null
    venue: string | null
  }[]
  dashboardUrl: string
  payAmount?: number | null
  leaderFee?: number | null
  isLeader?: boolean
  personalMessage?: string | null
  expiresAt?: string | null
  ensembleType?: string | null
  timezone?: string
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
  payAmount,
  leaderFee,
  isLeader,
  personalMessage,
  expiresAt,
  ensembleType,
  timezone,
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
              A contract offer has been sent to <strong>{musicianName}</strong> ({musicianEmail}).
              Here&apos;s exactly what they received:
            </Text>

            <Section style={buttonContainer}>
              <Button style={button} href={dashboardUrl}>
                View in Dashboard
              </Button>
            </Section>
          </Section>

          <Hr style={hr} />

          {/* Musician email preview */}
          <Section style={previewHeader}>
            <Text style={previewHeaderText}>What {musicianName} received</Text>
          </Section>

          <Section style={previewContent}>
            <Text style={previewGreeting}>Dear {musicianName},</Text>

            {personalMessage && (
              <Section style={personalMessageBox}>
                <Text style={personalMessageText}>&ldquo;{personalMessage}&rdquo;</Text>
              </Section>
            )}

            <Text style={previewParagraph}>
              You have been called to perform with <strong>{organizationName}</strong> for the following project:
            </Text>

            <Section style={detailsBox}>
              <Text style={detailsTitle}>{projectName}</Text>
              {ensembleType && (
                <Text style={detailsItem}>
                  <strong>Ensemble:</strong> {ensembleType}
                </Text>
              )}
              <Text style={detailsItem}>
                <strong>Position:</strong> {instrument}{showChair ? `, Chair ${chairNumber}` : ''}
              </Text>
              {payAmount != null && (
                <Text style={detailsItem}>
                  <strong>Pay:</strong> ${payAmount}
                  {isLeader && leaderFee ? ` (includes $${leaderFee} leader fee)` : ''}
                </Text>
              )}
              {expiresAt && (
                <Text style={detailsItem}>
                  <strong>Please respond by:</strong> {new Date(expiresAt).toLocaleDateString('en-US', { ...(timezone ? { timeZone: timezone } : {}) })}
                </Text>
              )}
            </Section>

            {services.length > 0 && (
              <>
                <Text style={sectionTitle}>Services:</Text>
                <Section style={servicesBox}>
                  {services.map((service, index) => (
                    <Section key={index} style={serviceRow}>
                      <Text style={serviceName}>{service.name}</Text>
                      <Text style={serviceDetail}>{service.date}</Text>
                      <Text style={serviceDetail}>
                        {service.callTime && `Call: ${service.callTime} | `}Start: {service.time}{service.endTime && ` | End: ${service.endTime}`}
                      </Text>
                      {service.venue && (
                        <Text style={serviceVenue}>
                          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(service.venue)}`} style={{ color: '#1E293B', textDecoration: 'underline' }}>
                            {service.venue}
                          </a>
                        </Text>
                      )}
                    </Section>
                  ))}
                </Section>
              </>
            )}

            <Text style={previewNote}>
              [The musician&apos;s email also includes a &quot;View &amp; Respond&quot; button and your organization&apos;s musician guidelines]
            </Text>
          </Section>

          <Hr style={hr} />

          <Section style={statusSection}>
            <Text style={statusLabel}>Status</Text>
            <Text style={pendingBadge}>AWAITING RESPONSE</Text>
            <Text style={infoText}>
              You will be notified when the musician responds.
            </Text>
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

const buttonContainer = {
  textAlign: 'center' as const,
  marginTop: '16px',
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

// Musician email preview styles
const previewHeader = {
  padding: '12px 24px',
  backgroundColor: '#f8fafc',
  borderBottom: '1px solid #e2e8f0',
}

const previewHeaderText = {
  fontSize: '12px',
  fontWeight: 'bold',
  color: '#64748b',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  margin: '0',
}

const previewContent = {
  padding: '24px',
  backgroundColor: '#fafbfc',
  borderLeft: '3px solid #cbd5e1',
}

const previewGreeting = {
  fontSize: '16px',
  lineHeight: '24px',
  marginBottom: '16px',
  color: '#1a1a1a',
}

const previewParagraph = {
  fontSize: '14px',
  lineHeight: '22px',
  color: '#525f7f',
  marginBottom: '16px',
}

const personalMessageBox = {
  backgroundColor: '#e0f2fe',
  borderLeft: '4px solid #1E293B',
  borderRadius: '0 8px 8px 0',
  padding: '12px 16px',
  marginBottom: '16px',
}

const personalMessageText = {
  fontSize: '14px',
  lineHeight: '22px',
  color: '#1e40af',
  fontStyle: 'italic' as const,
  margin: '0',
}

const detailsBox = {
  backgroundColor: '#ffffff',
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

const sectionTitle = {
  fontSize: '14px',
  fontWeight: 'bold',
  color: '#1a1a1a',
  marginBottom: '8px',
}

const servicesBox = {
  marginBottom: '16px',
}

const serviceRow = {
  backgroundColor: '#ffffff',
  borderLeftWidth: '3px',
  borderLeftStyle: 'solid' as const,
  borderLeftColor: '#1E293B',
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

const previewNote = {
  fontSize: '12px',
  color: '#94a3b8',
  fontStyle: 'italic' as const,
  textAlign: 'center' as const,
  marginTop: '16px',
}

const statusSection = {
  padding: '16px 24px',
  textAlign: 'center' as const,
}

const statusLabel = {
  fontSize: '12px',
  fontWeight: 'bold',
  color: '#64748b',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  margin: '0 0 8px 0',
}

const pendingBadge = {
  fontSize: '14px',
  fontWeight: 'bold',
  color: '#d97706',
  backgroundColor: '#fef3c7',
  padding: '6px 16px',
  borderRadius: '16px',
  display: 'inline-block' as const,
  margin: '0 0 8px 0',
}

const infoText = {
  fontSize: '14px',
  color: '#6b7280',
  fontStyle: 'italic' as const,
  margin: '0',
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
