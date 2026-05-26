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

interface OfferAcceptedEmailProps {
  musicianName: string
  organizationName: string
  contactEmail?: string
  projectName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  services: {
    name: string
    date: string
    time: string
    venue: string | null
    venue2?: string | null
  }[]
  calendarUrl?: string
  googleCalendarUrl?: string
}

export function OfferAcceptedEmail({
  musicianName,
  organizationName,
  contactEmail,
  projectName,
  instrument,
  chairNumber,
  totalChairs,
  services,
  calendarUrl,
  googleCalendarUrl,
}: OfferAcceptedEmailProps) {
  const showChair = totalChairs !== undefined ? totalChairs > 1 : true
  return (
    <Html>
      <Head />
      <Preview>
        Confirmed: You're booked for {projectName}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={content}>
            <Text style={greeting}>Hi {musicianName},</Text>

            <Text style={paragraph}>
              Thanks for accepting - you're confirmed for the following:
            </Text>

            <Section style={detailsBox}>
              <Text style={detailsTitle}>{projectName}</Text>
              <Text style={detailsItem}>
                <strong>Position:</strong> {instrument}{showChair ? `, Chair ${chairNumber}` : ''}
              </Text>
            </Section>

            {/* Calendar buttons — prioritized above services */}
            {(googleCalendarUrl || calendarUrl) && (
              <Section style={calendarSection}>
                <Text style={calendarHeading}>📅 Add to Your Calendar</Text>
                <Section style={calendarButtonRow}>
                  {googleCalendarUrl && (
                    <Button style={googleButton} href={googleCalendarUrl}>
                      Add to Google Calendar
                    </Button>
                  )}
                  {calendarUrl && (
                    <Button style={icsButton} href={calendarUrl}>
                      Download .ics (Outlook, Apple)
                    </Button>
                  )}
                </Section>
                <Text style={calendarHint}>
                  Add these dates to your calendar now so you don't forget!
                </Text>
              </Section>
            )}

            <Text style={sectionTitle}>Your Services:</Text>
            <Section style={servicesTable}>
              {services.map((service, index) => (
                <Section key={index} style={serviceRow}>
                  <Text style={serviceName}>{service.name}</Text>
                  <Text style={serviceDetail}>
                    📅 {service.date} at {service.time}
                  </Text>
                  {service.venue && (
                    <Text style={serviceVenue}>📍 {service.venue}</Text>
                  )}
                  {service.venue2 && (
                    <Text style={serviceVenue}>📍 {service.venue2}</Text>
                  )}
                </Section>
              ))}
            </Section>

            <Text style={paragraph}>
              If you have any questions or need to report a conflict,
              please contact {organizationName}{contactEmail ? <> at <a href={`mailto:${contactEmail}`} style={emailLink}>{contactEmail}</a></> : ''} as soon as possible.
            </Text>

            <Text style={thankYou}>
              We look forward to working with you!
            </Text>
          </Section>

          <Hr style={hr} />

          <Section style={footer}>
            <Text style={footerText}>
              This confirmation was sent by {organizationName} via Podium.
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

const successBanner = {
  backgroundColor: '#dcfce7',
  border: '1px solid #22c55e',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '24px',
  textAlign: 'center' as const,
}

const successIcon = {
  fontSize: '32px',
  margin: '0 0 8px 0',
  color: '#22c55e',
}

const successText = {
  fontSize: '20px',
  fontWeight: 'bold',
  color: '#166534',
  margin: '0',
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
  backgroundColor: '#f0fdf4',
  borderLeft: '3px solid #22c55e',
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

const calendarSection = {
  backgroundColor: '#f0f9ff',
  border: '1px solid #bae6fd',
  borderRadius: '8px',
  padding: '20px',
  marginBottom: '24px',
  textAlign: 'center' as const,
}

const calendarHeading = {
  fontSize: '16px',
  fontWeight: 'bold',
  color: '#0c4a6e',
  margin: '0 0 16px 0',
}

const calendarButtonRow = {
  textAlign: 'center' as const,
  marginBottom: '12px',
}

const googleButton = {
  backgroundColor: '#1E293B',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '14px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 24px',
  marginBottom: '8px',
}

const icsButton = {
  backgroundColor: '#ffffff',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  color: '#475569',
  fontSize: '13px',
  fontWeight: '500',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '10px 20px',
}

const calendarHint = {
  fontSize: '12px',
  color: '#64748b',
  margin: '0',
}

const emailLink = {
  color: '#1E293B',
  textDecoration: 'underline',
}

const thankYou = {
  fontSize: '14px',
  fontWeight: '500',
  color: '#166534',
  textAlign: 'center' as const,
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

export default OfferAcceptedEmail
