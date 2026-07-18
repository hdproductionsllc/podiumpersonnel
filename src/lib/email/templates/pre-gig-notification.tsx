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
import { PodiumFooter } from './podium-footer'
import { term, DEFAULT_TERMS, type TermDictionary } from '@/lib/verticals'

interface PreGigNotificationEmailProps {
  organizationName: string
  projectName: string
  gigDate: string
  venueName: string | null
  musicianCount: number
  gigDetailsSent: boolean
  musicSent: boolean
  reviewUrl: string
  branding?: EmailBranding
  terms?: TermDictionary
}

export function PreGigNotificationEmail({
  organizationName,
  projectName,
  gigDate,
  venueName,
  musicianCount,
  gigDetailsSent,
  musicSent,
  reviewUrl,
  branding,
  terms,
}: PreGigNotificationEmailProps) {
  const brandColor = branding?.brandColor || '#1E293B'
  const logoUrl = branding?.logoUrl
  const footerText = branding?.footerText
  const t = terms ?? DEFAULT_TERMS

  return (
    <Html>
      <Head />
      <Preview>
        {projectName} is in 2 days — review the reminder for your {term(t, 'person', { plural: true, case: 'lower' })}
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
            <Text style={greeting}>Upcoming Gig Reminder</Text>

            <Text style={paragraph}>
              <strong>{projectName}</strong> is coming up in 2 days. Review the details and send a reminder to your {term(t, 'person', { plural: true, case: 'lower' })}.
            </Text>

            <Section style={detailsBox}>
              <Text style={detailsItem}>
                <strong>Date:</strong> {gigDate}
              </Text>
              {venueName && (
                <Text style={detailsItem}>
                  <strong>Venue:</strong> {venueName}
                </Text>
              )}
              <Text style={detailsItem}>
                <strong>{term(t, 'person', { plural: true })}:</strong> {musicianCount} confirmed
              </Text>
              <Hr style={detailsDivider} />
              <Text style={statusItem}>
                Gig details: {gigDetailsSent ? 'Sent' : 'Not yet sent'}
              </Text>
              <Text style={statusItem}>
                Music: {musicSent ? 'Sent' : 'Not yet sent'}
              </Text>
            </Section>

            <Text style={paragraph}>
              You can add last-minute notes (parking changes, schedule updates, etc.) before sending the reminder to your {term(t, 'person', { plural: true, case: 'lower' })}.
            </Text>

            <Section style={buttonContainer}>
              <Button style={{ ...button, backgroundColor: brandColor }} href={reviewUrl}>
                Review &amp; Send Reminder
              </Button>
            </Section>

            <Text style={smallText}>
              If no action is taken, this reminder will expire after the gig date.
            </Text>
          </Section>

          <PodiumFooter
            organizationName={organizationName}
            footerText={footerText}
          />
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
  fontSize: '20px',
  fontWeight: 'bold',
  lineHeight: '28px',
  marginBottom: '16px',
  color: '#1E293B',
}

const paragraph = {
  fontSize: '14px',
  lineHeight: '22px',
  color: '#525f7f',
  marginBottom: '16px',
}

const detailsBox = {
  backgroundColor: '#f8fafc',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '16px',
  border: '1px solid #e2e8f0',
}

const detailsItem = {
  fontSize: '14px',
  color: '#334155',
  marginBottom: '6px',
  margin: '0 0 6px 0',
}

const detailsDivider = {
  borderColor: '#e2e8f0',
  margin: '12px 0',
}

const statusItem = {
  fontSize: '13px',
  color: '#64748b',
  marginBottom: '4px',
  margin: '0 0 4px 0',
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

export default PreGigNotificationEmail
