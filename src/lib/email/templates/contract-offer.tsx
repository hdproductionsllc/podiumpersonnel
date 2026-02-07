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

interface ContractOfferEmailProps {
  musicianName: string
  organizationName: string
  projectName: string
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
  responseUrl: string
  expiresAt: string | null
  notes?: string | null
  payAmount?: number | null
  leaderFee?: number | null
  isLeader?: boolean
  personalMessage?: string
  branding?: EmailBranding
}

export function ContractOfferEmail({
  musicianName,
  organizationName,
  projectName,
  instrument,
  chairNumber,
  totalChairs,
  services,
  responseUrl,
  expiresAt,
  notes,
  payAmount,
  leaderFee,
  isLeader,
  personalMessage,
  branding,
}: ContractOfferEmailProps) {
  const showChair = totalChairs !== undefined ? totalChairs > 1 : true
  const brandColor = branding?.brandColor || '#1E293B'
  const logoUrl = branding?.logoUrl
  const footerText = branding?.footerText

  return (
    <Html>
      <Head />
      <Preview>
        Call for {projectName} - {instrument}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={{ ...header, backgroundColor: brandColor }}>
            {logoUrl ? (
              <Img
                src={logoUrl}
                alt={organizationName}
                height="48"
                style={{ margin: '0 auto', maxWidth: '200px' }}
              />
            ) : (
              <Text style={heading}>{organizationName}</Text>
            )}
          </Section>

          <Section style={content}>
            <Text style={greeting}>Dear {musicianName},</Text>

            {personalMessage && (
              <Section style={personalMessageBox}>
                <Text style={personalMessageText}>&ldquo;{personalMessage}&rdquo;</Text>
              </Section>
            )}

            <Text style={paragraph}>
              You have been called to perform with <strong>{organizationName}</strong> for the following project:
            </Text>

            <Section style={detailsBox}>
              <Text style={detailsTitle}>{projectName}</Text>
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
                  <strong>Please respond by:</strong> {new Date(expiresAt).toLocaleDateString()}
                </Text>
              )}
            </Section>

            <Text style={sectionTitle}>Services:</Text>
            <Section style={servicesTable}>
              {services.map((service, index) => (
                <Section key={index} style={{ ...serviceRow, borderLeftColor: brandColor }}>
                  <Text style={serviceName}>{service.name}</Text>
                  <Text style={serviceDetail}>
                    {service.date}
                  </Text>
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

            {notes && (
              <>
                <Text style={sectionTitle}>Additional Notes:</Text>
                <Text style={paragraph}>{notes}</Text>
              </>
            )}

            <Section style={buttonContainer}>
              <Button style={{ ...button, backgroundColor: brandColor }} href={responseUrl}>
                View & Respond
              </Button>
            </Section>

            <Text style={smallText}>
              Click the button above to view the full details and accept or decline.
              After responding, you can create a free Podium account to manage all your gigs in one place.
            </Text>
          </Section>

          <Hr style={hr} />

          {/* Musician Guidelines & Policy */}
          <Section style={policySection}>
            <Text style={policyTitle}>{organizationName} Musician Guidelines</Text>

            <Text style={policyText}>
              As a {organizationName} musician, your professionalism reflects directly on the group.
              These expectations apply from arrival to departure at every event.
            </Text>

            <Text style={policyHeading}>Cancellation Policy</Text>
            <Text style={policyText}>
              <strong>If you need to cancel after accepting this engagement, you are responsible for finding
              your own qualified substitute, subject to our approval.</strong> Please notify us as soon as
              possible if any conflicts arise so we can work together to find a solution.
            </Text>

            <Text style={policyHeading}>1. Professionalism</Text>
            <Text style={policyText}>
              Always assume you're being watched and recorded. Stay positive and professional at all times.
              Keep conversation minimal and appropriate.
            </Text>

            <Text style={policyHeading}>2. Phones</Text>
            <Text style={policyText}>
              Keep phones silenced and out of sight unless used for tuning or essential cues.
            </Text>

            <Text style={policyHeading}>3. Appearance & Punctuality</Text>
            <Text style={policyText}>
              Arrive early with buffer time. Dress professionally and in accordance with {organizationName} attire guidelines.
            </Text>

            <Text style={policyHeading}>4. Belongings & Case Safety</Text>
            <Text style={policyText}>
              Bring only your instrument, music, stand, and water. No large purses or bags (small black purses are okay).
              All instrument cases must be out of sight and out of the way.
            </Text>

            <Text style={policyHeading}>5. Overtime</Text>
            <Text style={policyText}>
              You will be compensated for all time played beyond the contracted hours. If asked to stay past the
              contracted period, only agree to do so if you are available. The lead musician must confirm approval
              with the client or event coordinator before continuing beyond the contracted time.
            </Text>

            <Text style={policyHeading}>6. Team Conduct</Text>
            <Text style={policyText}>
              Greet teammates professionally. Be warm, collaborative, and supportive.
            </Text>
          </Section>

          <Hr style={hr} />

          <Section style={footer}>
            {footerText && (
              <Text style={footerTextStyle}>{footerText}</Text>
            )}
            <Text style={footerTextStyle}>
              This email was sent by {organizationName} via Podium.
            </Text>
            <Text style={footerTextStyle}>
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
  margin: '0',
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

const footerTextStyle = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  textAlign: 'center' as const,
  marginBottom: '4px',
}

const policySection = {
  padding: '24px',
  backgroundColor: '#fafafa',
}

const policyTitle = {
  fontSize: '16px',
  fontWeight: 'bold',
  color: '#1a1a1a',
  marginBottom: '16px',
  textAlign: 'center' as const,
}

const policyHeading = {
  fontSize: '13px',
  fontWeight: 'bold',
  color: '#1a1a1a',
  marginTop: '16px',
  marginBottom: '4px',
}

const policyText = {
  fontSize: '12px',
  lineHeight: '18px',
  color: '#525f7f',
  marginBottom: '8px',
}

const personalMessageBox = {
  backgroundColor: '#f0f9ff',
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

export default ContractOfferEmail
