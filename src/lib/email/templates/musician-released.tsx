import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Preview,
} from '@react-email/components'
import { PodiumFooter } from './podium-footer'
import { term, DEFAULT_TERMS, type TermDictionary } from '@/lib/verticals'

interface MusicianReleasedEmailProps {
  musicianName: string
  organizationName: string
  projectName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  serviceName: string | null
  substituteName: string
  terms?: TermDictionary
}

export function MusicianReleasedEmail({
  musicianName,
  organizationName,
  projectName,
  instrument,
  chairNumber,
  totalChairs,
  serviceName,
  substituteName,
  terms,
}: MusicianReleasedEmailProps) {
  const t = terms ?? DEFAULT_TERMS
  const showChair = totalChairs !== undefined ? totalChairs > 1 : true
  return (
    <Html>
      <Head />
      <Preview>
        You&apos;ve been released from {projectName} - your substitute has accepted
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={heading}>{organizationName}</Text>
          </Section>

          <Section style={content}>
            <Text style={greeting}>Dear {musicianName},</Text>

            <Section style={successBanner}>
              <Text style={successText}>You&apos;ve Been Released!</Text>
            </Section>

            <Text style={paragraph}>
              Great news! Your substitute <strong>{substituteName}</strong> has accepted the contract offer
              and will be taking your place. You are now released from this engagement.
            </Text>

            <Section style={detailsBox}>
              <Text style={detailsTitle}>{projectName}</Text>
              <Text style={detailsItem}>
                <strong>Position:</strong> {instrument}{showChair ? `, ${term(t, 'rank')} ${chairNumber}` : ''}
              </Text>
              <Text style={detailsItem}>
                <strong>{term(t, 'session')}:</strong> {serviceName || `All ${term(t, 'session', { plural: true, case: 'lower' })}`}
              </Text>
              <Text style={detailsItem}>
                <strong>Your Substitute:</strong> {substituteName}
              </Text>
            </Section>

            <Text style={paragraph}>
              Thank you for finding a qualified substitute. Your commitment to the ensemble
              is appreciated, and we look forward to working with you on future {term(t, 'work', { plural: true, case: 'lower' })}.
            </Text>

            <Text style={smallText}>
              If you have any questions, please contact {organizationName} directly.
            </Text>
          </Section>

          <PodiumFooter organizationName={organizationName} />
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

const successBanner = {
  backgroundColor: '#dcfce7',
  padding: '16px',
  borderRadius: '8px',
  marginBottom: '20px',
}

const successText = {
  color: '#166534',
  fontSize: '18px',
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

const smallText = {
  fontSize: '12px',
  color: '#8898aa',
  textAlign: 'center' as const,
}

export default MusicianReleasedEmail
