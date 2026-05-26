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

interface RosterMember {
  name: string
  instrument: string
  email: string
  phone: string | null
  isRecipient: boolean
}

interface GigDetailsEmailProps {
  musicianName: string
  organizationName: string
  projectName: string
  ensembleType: string | null
  services: {
    name: string
    date: string
    callTime?: string | null
    time: string
    endTime?: string | null
    venue: string | null
    venueUrl?: string | null
    venueAddress?: string | null
    venue2?: string | null
    venue2Url?: string | null
    venue2Address?: string | null
    parkingInfo?: string | null
    directions?: string | null
    parkingInfo2?: string | null
    directions2?: string | null
  }[]
  roster: RosterMember[]
  confirmUrl: string
  notes?: string
  branding?: EmailBranding
}

export function GigDetailsEmail({
  musicianName,
  organizationName,
  projectName,
  ensembleType,
  services,
  roster,
  confirmUrl,
  notes,
  branding,
}: GigDetailsEmailProps) {
  const brandColor = branding?.brandColor || '#1E293B'
  const logoUrl = branding?.logoUrl
  const footerText = branding?.footerText

  return (
    <Html>
      <Head />
      <Preview>
        Gig Details — {projectName}{services[0]?.date ? ` | ${services[0].date}` : ''}
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
              Here are the details for <strong>{projectName}</strong>. Please review and confirm at the bottom.
            </Text>

            {/* Event Details */}
            <Section style={detailsBox}>
              <Text style={detailsTitle}>{projectName}</Text>
              {ensembleType && (
                <Text style={detailsItem}>
                  <strong>Ensemble:</strong> {ensembleType}
                </Text>
              )}
            </Section>

            {/* Services */}
            <Text style={sectionTitle}>Schedule:</Text>
            <Section style={servicesTable}>
              {services.map((service, index) => (
                <Section key={index} style={{ ...serviceRow, borderLeftColor: brandColor }}>
                  <Text style={serviceName}>{service.name}</Text>
                  <Text style={serviceDetail}>{service.date}</Text>
                  <Text style={serviceDetail}>
                    {service.callTime && `Call: ${service.callTime} | `}Start: {service.time}{service.endTime && ` | End: ${service.endTime}`}
                  </Text>
                  {service.venue && (
                    <>
                      <Text style={serviceVenue}>
                        {service.venueUrl ? (
                          <a
                            href={service.venueUrl}
                            style={{ color: '#1E293B', textDecoration: 'underline' }}
                          >
                            {service.venue}
                          </a>
                        ) : service.venue}
                      </Text>
                      {service.venueAddress && (
                        <Text style={serviceAddress}>{service.venueAddress}</Text>
                      )}
                    </>
                  )}
                  {service.parkingInfo && (
                    <Text style={serviceDetail}>
                      <strong>Parking:</strong> {service.parkingInfo}
                    </Text>
                  )}
                  {service.directions && (
                    <Text style={serviceDetail}>
                      <strong>Access:</strong> {service.directions}
                    </Text>
                  )}
                  {service.venue2 && (
                    <>
                      <Text style={serviceVenue}>
                        {service.venue2Url ? (
                          <a
                            href={service.venue2Url}
                            style={{ color: '#1E293B', textDecoration: 'underline' }}
                          >
                            {service.venue2}
                          </a>
                        ) : service.venue2}
                      </Text>
                      {service.venue2Address && (
                        <Text style={serviceAddress}>{service.venue2Address}</Text>
                      )}
                    </>
                  )}
                  {service.parkingInfo2 && (
                    <Text style={serviceDetail}>
                      <strong>Parking:</strong> {service.parkingInfo2}
                    </Text>
                  )}
                  {service.directions2 && (
                    <Text style={serviceDetail}>
                      <strong>Access:</strong> {service.directions2}
                    </Text>
                  )}
                </Section>
              ))}
            </Section>

            {/* Roster */}
            <Text style={sectionTitle}>Your Ensemble:</Text>
            <Section style={rosterBox}>
              {roster.map((member, index) => (
                <Section
                  key={index}
                  style={member.isRecipient ? rosterRowHighlight : rosterRow}
                >
                  <Text style={rosterName}>
                    {member.name}{member.isRecipient ? ' (you)' : ''} — {member.instrument}
                  </Text>
                  <Text style={rosterContact}>
                    {member.email}{member.phone ? ` | ${member.phone}` : ''}
                  </Text>
                </Section>
              ))}
            </Section>

            {/* Notes */}
            {notes && (
              <>
                <Text style={sectionTitle}>Additional Notes:</Text>
                <Section style={notesBox}>
                  <Text style={notesText}>{notes}</Text>
                </Section>
              </>
            )}

            {/* Confirm Button */}
            <Section style={confirmSection}>
              <Text style={confirmText}>
                By confirming, you acknowledge you have reviewed:
              </Text>
              <Text style={checklistItem}>✓ Date, time, and location</Text>
              <Text style={checklistItem}>✓ Parking and access instructions</Text>
              <Text style={checklistItem}>✓ Ensemble roster and contact info</Text>

              <Text style={paragraph}>
                Confirm here:{' '}
                <a href={confirmUrl} style={{ color: brandColor, textDecoration: 'underline', wordBreak: 'break-all' }}>
                  {confirmUrl}
                </a>
              </Text>
            </Section>

            <Text style={smallText}>
              Click the button above to confirm you have reviewed the gig details.
            </Text>
          </Section>

          <Hr style={hr} />

          <Section style={footer}>
            {footerText && (
              <Text style={footerTextStyle}>{footerText}</Text>
            )}
            <Text style={footerTextStyle}>
              Questions? Reply to this email to reach {organizationName}.
            </Text>
            <Text style={footerTextStyle}>
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
  margin: '0 0 2px 0',
}

const serviceAddress = {
  fontSize: '12px',
  color: '#8898aa',
  margin: '0 0 2px 0',
}

const rosterBox = {
  marginBottom: '24px',
}

const rosterRow = {
  backgroundColor: '#f8fafc',
  padding: '10px 16px',
  marginBottom: '4px',
  borderRadius: '4px',
}

const rosterRowHighlight = {
  backgroundColor: '#eff6ff',
  border: '1px solid #bfdbfe',
  padding: '10px 16px',
  marginBottom: '4px',
  borderRadius: '4px',
}

const rosterName = {
  fontSize: '14px',
  fontWeight: 'bold',
  color: '#1a1a1a',
  margin: '0 0 2px 0',
}

const rosterContact = {
  fontSize: '12px',
  color: '#64748b',
  margin: '0',
}

const notesBox = {
  backgroundColor: '#fffbeb',
  border: '1px solid #fde68a',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '24px',
}

const notesText = {
  fontSize: '14px',
  lineHeight: '22px',
  color: '#92400e',
  margin: '0',
  whiteSpace: 'pre-wrap' as const,
}

const confirmSection = {
  backgroundColor: '#f0fdf4',
  border: '1px solid #bbf7d0',
  borderRadius: '8px',
  padding: '20px',
  marginBottom: '16px',
}

const confirmText = {
  fontSize: '14px',
  fontWeight: 'bold',
  color: '#166534',
  marginBottom: '8px',
}

const checklistItem = {
  fontSize: '13px',
  color: '#15803d',
  margin: '0 0 4px 0',
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

export default GigDetailsEmail
