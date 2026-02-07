import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Hr,
  Preview,
  Button,
} from '@react-email/components'

interface MusicianWelcomeEmailProps {
  musicianName: string
  email: string
  loginUrl: string
  organizations: string[]
}

export function MusicianWelcomeEmail({
  musicianName,
  email,
  loginUrl,
  organizations,
}: MusicianWelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Welcome to Podium - Your musician portal is ready
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={heading}>Welcome to Podium</Text>
          </Section>

          <Section style={content}>
            <Text style={greeting}>Hi {musicianName},</Text>

            <Text style={paragraph}>
              Your Podium musician portal account has been created successfully!
              You can now manage your gigs, view offers, and track your schedule
              all in one place.
            </Text>

            <Section style={infoBox}>
              <Text style={infoTitle}>Your Account Details</Text>
              <Text style={infoItem}><strong>Email:</strong> {email}</Text>
              <Text style={infoItem}>
                <strong>Connected Organizations:</strong>{' '}
                {organizations.length > 0 ? organizations.join(', ') : 'None yet'}
              </Text>
            </Section>

            <Section style={featuresBox}>
              <Text style={featuresTitle}>Getting Started</Text>
              <Text style={featureItem}>
                <strong>Dashboard:</strong> See your pending offers and upcoming gigs at a glance
              </Text>
              <Text style={featureItem}>
                <strong>Offers:</strong> Review and respond to contract offers from your organizations
              </Text>
              <Text style={featureItem}>
                <strong>Schedule:</strong> View your confirmed services in a calendar or list view
              </Text>
              <Text style={featureItem}>
                <strong>Profile:</strong> Update your contact info and notification preferences
              </Text>
            </Section>

            <Section style={buttonContainer}>
              <Button style={button} href={loginUrl}>
                Go to Your Portal
              </Button>
            </Section>

            <Text style={smallText}>
              If you have any questions, please contact the organizations you work with directly.
            </Text>
          </Section>

          <Hr style={hr} />

          <Section style={footer}>
            <Text style={footerTextStyle}>
              This email was sent by Podium.
            </Text>
            <Text style={footerTextStyle}>
              You received this email because you created a musician portal account.
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
  backgroundColor: '#1E293B',
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

const infoBox = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '16px',
}

const infoTitle = {
  fontSize: '14px',
  fontWeight: 'bold',
  color: '#1a1a1a',
  marginBottom: '12px',
}

const infoItem = {
  fontSize: '14px',
  color: '#525f7f',
  marginBottom: '8px',
}

const featuresBox = {
  backgroundColor: '#eff6ff',
  border: '1px solid #1E293B',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '24px',
}

const featuresTitle = {
  fontSize: '14px',
  fontWeight: 'bold',
  color: '#1e40af',
  marginBottom: '12px',
}

const featureItem = {
  fontSize: '13px',
  color: '#1e40af',
  marginBottom: '8px',
  lineHeight: '20px',
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
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 32px',
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

export default MusicianWelcomeEmail
