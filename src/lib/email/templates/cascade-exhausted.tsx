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

/**
 * To the organization's admins, once per exhaustion: auto-offer was on, the
 * last offer for a position ended, and nobody left on the call list is free.
 * Podium stops there; a person has to pick someone.
 */
interface CascadeExhaustedEmailProps {
  organizationName: string
  projectName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  /** Who the last offer was to, and how it ended. */
  lastMusicianName: string
  lastOutcome: 'declined' | 'expired' | 'dropped'
  performanceDate?: string
  dashboardUrl: string
  /** Free on the call list but passed over: no email address on file. */
  noEmailNames?: string[]
  terms?: TermDictionary
}

const ENDED: Record<CascadeExhaustedEmailProps['lastOutcome'], string> = {
  declined: 'declined',
  expired: 'did not answer in time',
  dropped: 'dropped out',
}

export function CascadeExhaustedEmail({
  organizationName,
  projectName,
  instrument,
  chairNumber,
  totalChairs,
  lastMusicianName,
  lastOutcome,
  performanceDate,
  dashboardUrl,
  noEmailNames,
  terms,
}: CascadeExhaustedEmailProps) {
  const t = terms ?? DEFAULT_TERMS
  const showChair = totalChairs !== undefined ? totalChairs > 1 : true
  const position = `${instrument}${showChair && t.rank ? `, ${term(t, 'rank')} ${chairNumber}` : ''}`
  const people = term(t, 'person', { plural: true, case: 'lower' })
  const noEmail = noEmailNames?.filter(Boolean) ?? []

  return (
    <Html>
      <Head />
      <Preview>
        Nobody left for {position} on {projectName}: please pick someone
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={heading}>{organizationName}</Text>
          </Section>

          <Section style={content}>
            <Section style={banner}>
              <Text style={bannerText}>Nobody left to offer this position to</Text>
            </Section>

            <Text style={paragraph}>
              <strong>{lastMusicianName}</strong> {ENDED[lastOutcome]}. Auto-offer is on, so Podium went down your call
              list for this position, and nobody left on it is free{noEmail.length > 0 ? ' and reachable by email' : ''}.
            </Text>

            {noEmail.length > 0 && (
              <Text style={paragraph}>
                {noEmail.length === 1 ? (
                  <>
                    <strong>{noEmail[0]}</strong> is free but has no email address on file, so Podium could not offer it
                    to them.
                  </>
                ) : (
                  <>
                    <strong>{noEmail.join(', ')}</strong> are free but have no email address on file, so Podium could
                    not offer it to them.
                  </>
                )}
              </Text>
            )}

            <Section style={detailsBox}>
              <Text style={detailsTitle}>{projectName}</Text>
              {performanceDate && (
                <Text style={detailsItem}>
                  <strong>Date:</strong> {performanceDate}
                </Text>
              )}
              <Text style={detailsItem}>
                <strong>Position:</strong> {position}
              </Text>
            </Section>

            <Text style={actionText}>
              Please pick someone: offer it to one of your {people} yourself, or add someone to your roster. Podium
              will not send anything more for this position until you do.
            </Text>

            <Section style={buttonContainer}>
              <Button style={button} href={dashboardUrl}>
                View in Dashboard
              </Button>
            </Section>
          </Section>

          <Hr style={hr} />

          <Section style={footer}>
            <Text style={footerText}>This notification was sent by Podium.</Text>
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

const banner = {
  backgroundColor: '#fef2f2',
  border: '1px solid #fca5a5',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '24px',
  textAlign: 'center' as const,
}

const bannerText = {
  fontSize: '18px',
  fontWeight: 'bold',
  margin: '0',
  color: '#991b1b',
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

const actionText = {
  fontSize: '14px',
  color: '#525f7f',
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

export default CascadeExhaustedEmail
