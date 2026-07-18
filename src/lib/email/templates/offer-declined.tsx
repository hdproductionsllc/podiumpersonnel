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

interface OfferDeclinedEmailProps {
  musicianName: string
  organizationName: string
  projectName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  declineReason?: string | null
  terms?: TermDictionary
}

export function OfferDeclinedEmail({
  musicianName,
  organizationName,
  projectName,
  instrument,
  chairNumber,
  totalChairs,
  declineReason,
  terms,
}: OfferDeclinedEmailProps) {
  const t = terms ?? DEFAULT_TERMS
  const showChair = totalChairs !== undefined ? totalChairs > 1 : true
  return (
    <Html>
      <Head />
      <Preview>
        Thank you for your response - {projectName}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={heading}>{organizationName}</Text>
          </Section>

          <Section style={content}>
            <Text style={greeting}>Dear {musicianName},</Text>

            <Text style={paragraph}>
              Thank you for responding to our contract offer for <strong>{projectName}</strong>.
            </Text>

            <Text style={paragraph}>
              We understand you are unable to accept the position of{' '}
              <strong>{instrument}{showChair ? `, ${term(t, 'rank')} ${chairNumber}` : ''}</strong> at this time.
            </Text>

            {declineReason && (
              <Section style={reasonBox}>
                <Text style={reasonLabel}>Your notes:</Text>
                <Text style={reasonText}>{declineReason}</Text>
              </Section>
            )}

            <Text style={paragraph}>
              We appreciate you letting us know promptly, and we hope to work with you on future {term(t, 'work', { plural: true, case: 'lower' })}.
            </Text>

            <Text style={signOff}>
              Best regards,<br />
              {organizationName}
            </Text>
          </Section>

          <PodiumFooter organizationName={organizationName} />
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

const reasonBox = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '16px',
}

const reasonLabel = {
  fontSize: '12px',
  fontWeight: 'bold',
  color: '#64748b',
  marginBottom: '4px',
  textTransform: 'uppercase' as const,
}

const reasonText = {
  fontSize: '14px',
  color: '#525f7f',
  margin: '0',
  fontStyle: 'italic' as const,
}

const signOff = {
  fontSize: '14px',
  lineHeight: '22px',
  color: '#525f7f',
  marginTop: '24px',
}

export default OfferDeclinedEmail
