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

interface OfferExpiringSoonEmailProps {
  organizationName: string
  projectName: string
  musicianName: string
  instrument: string
  chairNumber: number
  totalChairs?: number
  hoursRemaining: number
  dashboardUrl: string
}

export function OfferExpiringSoonEmail({
  organizationName,
  projectName,
  musicianName,
  instrument,
  chairNumber,
  totalChairs,
  hoursRemaining,
  dashboardUrl,
}: OfferExpiringSoonEmailProps) {
  const showChair = totalChairs !== undefined ? totalChairs > 1 : true

  return (
    <Html>
      <Head />
      <Preview>
        {`${musicianName} has not responded — offer expires in ${hoursRemaining} hours`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={heading}>{organizationName}</Text>
          </Section>

          <Section style={content}>
            <Section style={warningBanner}>
              <Text style={bannerIcon}>&#9888;&#65039;</Text>
              <Text style={bannerText}>Offer Expiring Soon</Text>
            </Section>

            <Text style={paragraph}>
              <strong>{musicianName}</strong> has not yet responded to their contract offer
              and it expires in approximately <strong>{hoursRemaining} hours</strong>.
            </Text>

            <Section style={detailsBox}>
              <Text style={detailsTitle}>{projectName}</Text>
              <Text style={detailsItem}>
                <strong>Position:</strong> {instrument}{showChair ? `, Chair ${chairNumber}` : ''}
              </Text>
              <Text style={detailsItem}>
                <strong>Musician:</strong> {musicianName}
              </Text>
              <Text style={detailsItem}>
                <strong>Status:</strong>{' '}
                <span style={pendingText}>No response yet</span>
              </Text>
            </Section>

            <Text style={paragraph}>
              A reminder has also been sent to the musician. If they don&apos;t respond before the deadline,
              the offer will expire automatically and you&apos;ll be notified to send to the next musician on the call list.
            </Text>

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

const warningBanner = {
  backgroundColor: '#fef3c7',
  border: '1px solid #f59e0b',
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
  color: '#92400e',
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

const pendingText = {
  color: '#b45309',
  fontWeight: 'bold',
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

export default OfferExpiringSoonEmail
