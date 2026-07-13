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

interface AdminWelcomeEmailProps {
  userName: string
  organizationName: string
  dashboardUrl: string
  terms?: TermDictionary
}

export function AdminWelcomeEmail({
  userName,
  organizationName,
  dashboardUrl,
  terms,
}: AdminWelcomeEmailProps) {
  const t = terms ?? DEFAULT_TERMS
  return (
    <Html>
      <Head />
      <Preview>
        Welcome to Podium — {organizationName} is ready to go
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={heading}>Podium</Text>
          </Section>

          <Section style={content}>
            <Text style={greeting}>Welcome, {userName}!</Text>

            <Text style={paragraph}>
              Your organization <strong>{organizationName}</strong> has been created on Podium. Your {term(t, 'skill', { plural: true, case: 'lower' })} are already pre-loaded and you&apos;re ready to start managing your personnel.
            </Text>

            <Text style={sectionTitle}>Here&apos;s how to get started:</Text>

            <Section style={stepBox}>
              <Text style={stepNumber}>1</Text>
              <Text style={stepText}>
                <strong>Build your roster</strong> — Import a spreadsheet of {term(t, 'person', { plural: true, case: 'lower' })} or add them one by one. Include their call order to make staffing easier.
              </Text>
            </Section>

            <Section style={stepBox}>
              <Text style={stepNumber}>2</Text>
              <Text style={stepText}>
                <strong>Create a {term(t, 'work', { case: 'lower' })}</strong> — Set up your next concert, gig, or event and add the rehearsals and performances ({term(t, 'session', { plural: true, case: 'lower' })}) within it.
              </Text>
            </Section>

            <Section style={stepBox}>
              <Text style={stepNumber}>3</Text>
              <Text style={stepText}>
                <strong>Send calls</strong> — Add positions (like Violin 1, Cello) and send calls to {term(t, 'person', { plural: true, case: 'lower' })}. They can accept or decline directly from the email.
              </Text>
            </Section>

            <Section style={buttonContainer}>
              <Button style={button} href={dashboardUrl}>
                Go to Your Dashboard
              </Button>
            </Section>

            <Text style={smallText}>
              If you have any questions, reply to this email and we&apos;ll be happy to help.
            </Text>
          </Section>

          <Hr style={hr} />

          <Section style={footer}>
            <Text style={footerTextStyle}>
              You received this email because you created an account on Podium.
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
  fontSize: '18px',
  lineHeight: '24px',
  fontWeight: 'bold',
  marginBottom: '16px',
}

const paragraph = {
  fontSize: '14px',
  lineHeight: '22px',
  color: '#525f7f',
  marginBottom: '16px',
}

const sectionTitle = {
  fontSize: '14px',
  fontWeight: 'bold',
  color: '#1a1a1a',
  marginBottom: '16px',
}

const stepBox = {
  marginBottom: '12px',
  paddingLeft: '8px',
}

const stepNumber = {
  display: 'inline-block' as const,
  width: '24px',
  height: '24px',
  borderRadius: '50%',
  backgroundColor: '#1E293B',
  color: '#ffffff',
  fontSize: '12px',
  fontWeight: 'bold',
  textAlign: 'center' as const,
  lineHeight: '24px',
  marginRight: '8px',
  marginBottom: '0',
}

const stepText = {
  fontSize: '14px',
  lineHeight: '22px',
  color: '#525f7f',
  marginBottom: '0',
  marginTop: '-20px',
  paddingLeft: '36px',
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

export default AdminWelcomeEmail
