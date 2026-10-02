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
import { AutoOfferNoteSection, type AutoOfferNote } from './auto-offer-note'

/**
 * To the organization's admins: someone who had accepted pressed "I can't make
 * it" on their gig page (organizations.allow_worker_drop on). They are no
 * longer booked and their position is open again. With auto-offer on, the
 * note says what Podium did next; without it, the admin is asked to fill it.
 */
interface AdminWorkerDroppedEmailProps {
  organizationName: string
  projectName: string
  musicianName: string
  musicianEmail?: string | null
  instrument: string
  chairNumber: number
  totalChairs?: number
  /** Their optional note from the gig page. */
  reason?: string | null
  performanceDate?: string
  dashboardUrl: string
  autoOffer?: AutoOfferNote
  terms?: TermDictionary
}

export function AdminWorkerDroppedEmail({
  organizationName,
  projectName,
  musicianName,
  musicianEmail,
  instrument,
  chairNumber,
  totalChairs,
  reason,
  performanceDate,
  dashboardUrl,
  autoOffer,
  terms,
}: AdminWorkerDroppedEmailProps) {
  const t = terms ?? DEFAULT_TERMS
  const showChair = totalChairs !== undefined ? totalChairs > 1 : true
  const position = `${instrument}${showChair && t.rank ? `, ${term(t, 'rank')} ${chairNumber}` : ''}`
  const work = term(t, 'work', { case: 'lower' })

  return (
    <Html>
      <Head />
      <Preview>
        {musicianName} can&apos;t make it: {position} on {projectName} is open again
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={heading}>{organizationName}</Text>
          </Section>

          <Section style={content}>
            <Section style={banner}>
              <Text style={bannerText}>{musicianName} can&apos;t make it</Text>
            </Section>

            <Text style={paragraph}>
              <strong>{musicianName}</strong> had accepted this {work} and has now told Podium they can&apos;t make it.
              They are no longer booked, and their position is open again.
            </Text>

            {reason && (
              <Section style={reasonBox}>
                <Text style={reasonLabel}>Their note</Text>
                <Text style={reasonText}>&ldquo;{reason}&rdquo;</Text>
              </Section>
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
              {musicianEmail && (
                <Text style={detailsItem}>
                  <strong>Email:</strong> {musicianEmail}
                </Text>
              )}
            </Section>

            {autoOffer ? (
              <AutoOfferNoteSection note={autoOffer} terms={terms} />
            ) : (
              <Text style={actionText}>Please offer this position to someone else from the dashboard.</Text>
            )}

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
  backgroundColor: '#fffbeb',
  border: '1px solid #fcd34d',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '24px',
  textAlign: 'center' as const,
}

const bannerText = {
  fontSize: '18px',
  fontWeight: 'bold',
  margin: '0',
  color: '#92400e',
}

const paragraph = {
  fontSize: '14px',
  lineHeight: '22px',
  color: '#525f7f',
  marginBottom: '16px',
}

const reasonBox = {
  backgroundColor: '#f8fafc',
  borderLeft: '4px solid #94a3b8',
  padding: '12px 16px',
  marginBottom: '16px',
}

const reasonLabel = {
  fontSize: '12px',
  fontWeight: 'bold',
  color: '#64748b',
  margin: '0 0 4px 0',
}

const reasonText = {
  fontSize: '14px',
  color: '#334155',
  margin: '0',
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

export default AdminWorkerDroppedEmail
