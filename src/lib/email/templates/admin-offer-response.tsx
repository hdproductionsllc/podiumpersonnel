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
import { term, DEFAULT_TERMS, type TermDictionary } from '@/lib/verticals'

interface AdminOfferResponseEmailProps {
  adminName?: string
  organizationName: string
  projectName: string
  musicianName: string
  musicianEmail: string | null
  instrument: string
  chairNumber: number
  totalChairs?: number
  status: 'accepted' | 'declined' | 'rescinded'
  responseNotes?: string | null
  dashboardUrl: string
  terms?: TermDictionary
}

export function AdminOfferResponseEmail({
  adminName,
  organizationName,
  projectName,
  musicianName,
  musicianEmail,
  instrument,
  chairNumber,
  totalChairs,
  status,
  responseNotes,
  dashboardUrl,
  terms,
}: AdminOfferResponseEmailProps) {
  const t = terms ?? DEFAULT_TERMS
  const isAccepted = status === 'accepted'
  const isRescinded = status === 'rescinded'
  const showChair = totalChairs !== undefined ? totalChairs > 1 : true

  const verb = isAccepted ? 'accepted' : isRescinded ? 'had their offer rescinded for' : 'declined'
  const bannerLabel = isAccepted ? 'Offer Accepted' : isRescinded ? 'Offer Rescinded' : 'Offer Declined'
  const bannerIconChar = isAccepted ? '✓' : isRescinded ? '↺' : '✗'
  const responseLabel = isAccepted ? 'ACCEPTED' : isRescinded ? 'RESCINDED' : 'DECLINED'
  const responseStyle = isAccepted ? acceptedText : declinedText
  const bannerStyle = isAccepted ? acceptedBanner : declinedBanner

  return (
    <Html>
      <Head />
      <Preview>
        {isRescinded
          ? `Offer to ${musicianName} for ${projectName} was rescinded`
          : `${musicianName} has ${verb} the offer for ${projectName}`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={heading}>{organizationName}</Text>
          </Section>

          <Section style={content}>
            <Section style={bannerStyle}>
              <Text style={bannerIcon}>{bannerIconChar}</Text>
              <Text style={bannerText}>{bannerLabel}</Text>
            </Section>

            {adminName && <Text style={greeting}>Hi {adminName},</Text>}

            <Text style={paragraph}>
              {isRescinded ? (
                <>The offer to <strong>{musicianName}</strong> was rescinded for:</>
              ) : (
                <><strong>{musicianName}</strong> has {verb} the contract offer for:</>
              )}
            </Text>

            <Section style={detailsBox}>
              <Text style={detailsTitle}>{projectName}</Text>
              <Text style={detailsItem}>
                <strong>Position:</strong> {instrument}{showChair ? `, ${term(t, 'rank')} ${chairNumber}` : ''}
              </Text>
              <Text style={detailsItem}>
                <strong>{term(t, 'person')}:</strong> {musicianName}
                {musicianEmail && ` (${musicianEmail})`}
              </Text>
              <Text style={detailsItem}>
                <strong>{isRescinded ? 'Status' : 'Response'}:</strong>{' '}
                <span style={responseStyle}>{responseLabel}</span>
              </Text>
            </Section>

            {responseNotes && !isRescinded && (
              <>
                <Text style={sectionTitle}>Notes from {term(t, 'person', { case: 'lower' })}:</Text>
                <Section style={notesBox}>
                  <Text style={notesText}>{responseNotes}</Text>
                </Section>
              </>
            )}

            {!isAccepted && (
              <Text style={actionText}>
                The position is now vacant. You may want to send an offer to another {term(t, 'person', { case: 'lower' })}.
              </Text>
            )}

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

const acceptedBanner = {
  backgroundColor: '#dcfce7',
  border: '1px solid #22c55e',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '24px',
  textAlign: 'center' as const,
}

const declinedBanner = {
  backgroundColor: '#fee2e2',
  border: '1px solid #ef4444',
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

const acceptedText = {
  color: '#166534',
  fontWeight: 'bold',
}

const declinedText = {
  color: '#dc2626',
  fontWeight: 'bold',
}

const sectionTitle = {
  fontSize: '14px',
  fontWeight: 'bold',
  color: '#1a1a1a',
  marginBottom: '8px',
}

const notesBox = {
  backgroundColor: '#fefce8',
  border: '1px solid #eab308',
  borderRadius: '8px',
  padding: '12px 16px',
  marginBottom: '16px',
}

const notesText = {
  fontSize: '14px',
  color: '#525f7f',
  margin: '0',
  fontStyle: 'italic' as const,
}

const actionText = {
  fontSize: '14px',
  color: '#dc2626',
  marginBottom: '16px',
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

export default AdminOfferResponseEmail
