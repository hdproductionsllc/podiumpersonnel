import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Preview,
} from '@react-email/components'
import { PodiumFooter } from './podium-footer'
import { term, DEFAULT_TERMS, type TermDictionary } from '@/lib/verticals'

interface SubDeclinedFindAnotherEmailProps {
  musicianName: string
  organizationName: string
  projectName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  serviceName: string | null
  suggestedSubName: string
  gigUrl: string
  terms?: TermDictionary
}

export function SubDeclinedFindAnotherEmail({
  musicianName,
  organizationName,
  projectName,
  instrument,
  chairNumber,
  totalChairs,
  serviceName,
  suggestedSubName,
  gigUrl,
  terms,
}: SubDeclinedFindAnotherEmailProps) {
  const t = terms ?? DEFAULT_TERMS
  const showChair = totalChairs !== undefined ? totalChairs > 1 : true
  return (
    <Html>
      <Head />
      <Preview>
        Your suggested sub declined - please find another substitute for {projectName}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={heading}>{organizationName}</Text>
          </Section>

          <Section style={content}>
            <Text style={greeting}>Dear {musicianName},</Text>

            <Section style={warningBanner}>
              <Text style={warningText}>Your Suggested Sub Declined</Text>
            </Section>

            <Text style={paragraph}>
              Unfortunately, <strong>{suggestedSubName}</strong> has declined the contract offer
              for this engagement. You are still responsible for finding a substitute.
            </Text>

            <Section style={detailsBox}>
              <Text style={detailsTitle}>{projectName}</Text>
              <Text style={detailsItem}>
                <strong>Position:</strong> {instrument}{showChair ? `, ${term(t, 'rank')} ${chairNumber}` : ''}
              </Text>
              <Text style={detailsItem}>
                <strong>{term(t, 'session')}:</strong> {serviceName || `All ${term(t, 'session', { plural: true, case: 'lower' })}`}
              </Text>
            </Section>

            <Text style={paragraph}>
              <strong>What should you do?</strong>
            </Text>
            <Text style={paragraph}>
              Please find another qualified substitute and submit a new request as soon as possible.
              Remember that you remain committed to this engagement until a suitable substitute
              has been found and approved.
            </Text>

            <Section style={buttonContainer}>
              <Button style={button} href={gigUrl}>
                Submit New Sub Request
              </Button>
            </Section>

            <Text style={smallText}>
              The sooner you find a replacement, the more likely they&apos;ll be available for this date.
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

const warningBanner = {
  backgroundColor: '#fef3c7',
  padding: '16px',
  borderRadius: '8px',
  marginBottom: '20px',
}

const warningText = {
  color: '#92400e',
  fontSize: '16px',
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
  fontStyle: 'italic',
}

export default SubDeclinedFindAnotherEmail
