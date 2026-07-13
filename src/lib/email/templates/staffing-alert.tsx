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
import { term, DEFAULT_TERMS, type TermDictionary } from '@/lib/verticals'

interface UnfilledPosition {
  instrument: string
  chairNumber: number
  status: 'vacant' | 'offered' | 'declined'
}

interface StaffingAlertEmailProps {
  organizationName: string
  projectName: string
  gigDate: string
  venueName: string | null
  daysAway: number
  totalPositions: number
  confirmedCount: number
  unfilledPositions: UnfilledPosition[]
  dashboardUrl: string
  branding?: EmailBranding
  terms?: TermDictionary
}

export function StaffingAlertEmail({
  organizationName,
  projectName,
  gigDate,
  venueName,
  daysAway,
  totalPositions,
  confirmedCount,
  unfilledPositions,
  dashboardUrl,
  branding,
  terms,
}: StaffingAlertEmailProps) {
  const brandColor = branding?.brandColor || '#1E293B'
  const logoUrl = branding?.logoUrl
  const footerText = branding?.footerText
  const t = terms ?? DEFAULT_TERMS

  const urgencyLabel =
    daysAway <= 3 ? 'Urgent' : daysAway <= 7 ? 'Action Needed' : 'Heads Up'

  const urgencyColor =
    daysAway <= 3 ? '#dc2626' : daysAway <= 7 ? '#ea580c' : '#ca8a04'

  // Group unfilled positions by instrument
  const grouped: Record<string, UnfilledPosition[]> = {}
  for (const pos of unfilledPositions) {
    if (!grouped[pos.instrument]) grouped[pos.instrument] = []
    grouped[pos.instrument].push(pos)
  }

  return (
    <Html>
      <Head />
      <Preview>
        {`${urgencyLabel}: ${projectName} is ${daysAway} days away with ${unfilledPositions.length} unfilled ${unfilledPositions.length === 1 ? 'position' : 'positions'}`}
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
            <Text style={{ ...urgencyBadge, backgroundColor: urgencyColor }}>
              {urgencyLabel}: {daysAway} days away
            </Text>

            <Text style={greeting}>Staffing Alert</Text>

            <Text style={paragraph}>
              <strong>{projectName}</strong> is <strong>{daysAway} days away</strong> and
              still has <strong>{unfilledPositions.length} unfilled {unfilledPositions.length === 1 ? 'position' : 'positions'}</strong> out
              of {totalPositions} total.
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
                <strong>Confirmed:</strong> {confirmedCount} of {totalPositions} positions
              </Text>
              <Hr style={detailsDivider} />
              <Text style={{ ...detailsItem, fontWeight: 'bold', marginBottom: '8px' }}>
                Unfilled positions:
              </Text>
              {Object.entries(grouped).map(([instrument, positions]) => (
                <Text key={instrument} style={positionItem}>
                  {instrument}: {positions.length} {positions.length === 1 ? 'seat' : 'seats'}{' '}
                  ({positions.map((p) => {
                    const label = p.status === 'offered' ? 'pending response' : p.status
                    return `${term(t, 'rank')} ${p.chairNumber} — ${label}`
                  }).join(', ')})
                </Text>
              ))}
            </Section>

            <Section style={buttonContainer}>
              <Button style={{ ...button, backgroundColor: brandColor }} href={dashboardUrl}>
                View {term(t, 'work')} &amp; Fill Positions
              </Button>
            </Section>

            <Text style={smallText}>
              You&apos;ll receive another reminder if positions remain unfilled as the gig gets closer.
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

const urgencyBadge = {
  color: '#ffffff',
  fontSize: '12px',
  fontWeight: 'bold',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  padding: '4px 10px',
  borderRadius: '4px',
  display: 'inline-block',
  marginBottom: '16px',
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

const positionItem = {
  fontSize: '13px',
  color: '#64748b',
  margin: '0 0 4px 0',
  paddingLeft: '8px',
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

export default StaffingAlertEmail
