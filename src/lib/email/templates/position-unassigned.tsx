import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Hr,
  Preview,
} from '@react-email/components'
import { term, DEFAULT_TERMS, type TermDictionary } from '@/lib/verticals'

interface PositionUnassignedEmailProps {
  musicianName: string
  organizationName: string
  projectName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  terms?: TermDictionary
}

export function PositionUnassignedEmail({
  musicianName,
  organizationName,
  projectName,
  instrument,
  chairNumber,
  totalChairs,
  terms,
}: PositionUnassignedEmailProps) {
  const t = terms ?? DEFAULT_TERMS
  const showChair = totalChairs !== undefined ? totalChairs > 1 : true
  return (
    <Html>
      <Head />
      <Preview>
        Update: Your position for {projectName} has been changed
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={heading}>{organizationName}</Text>
          </Section>

          <Section style={content}>
            <Text style={greeting}>Dear {musicianName},</Text>

            <Text style={paragraph}>
              We are writing to inform you that you have been unassigned from the following position:
            </Text>

            <Section style={detailsBox}>
              <Text style={detailsTitle}>{projectName}</Text>
              <Text style={detailsItem}>
                <strong>Position:</strong> {instrument}{showChair ? `, ${term(t, 'rank')} ${chairNumber}` : ''}
              </Text>
            </Section>

            <Text style={paragraph}>
              If you have any questions about this change, please contact {organizationName} directly.
            </Text>

            <Text style={paragraph}>
              We appreciate your understanding and hope to work with you on future {term(t, 'work', { plural: true, case: 'lower' })}.
            </Text>
          </Section>

          <Hr style={hr} />

          <Section style={footer}>
            <Text style={footerText}>
              This notification was sent by {organizationName} via Podium.
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
  backgroundColor: '#fef3c7',
  border: '1px solid #f59e0b',
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

export default PositionUnassignedEmail
