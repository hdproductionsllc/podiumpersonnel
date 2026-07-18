import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Preview,
  Img,
} from '@react-email/components'
import { type EmailBranding } from './email-layout'
import { PodiumFooter } from './podium-footer'
import { term, DEFAULT_TERMS, type TermDictionary } from '@/lib/verticals'

interface W9RequestEmailProps {
  musicianName: string
  organizationName: string
  adminEmail?: string
  branding?: EmailBranding
  terms?: TermDictionary
}

export function W9RequestEmail({
  musicianName,
  organizationName,
  adminEmail,
  branding,
  terms,
}: W9RequestEmailProps) {
  const t = terms ?? DEFAULT_TERMS
  const brandColor = branding?.brandColor || '#1E293B'
  const logoUrl = branding?.logoUrl
  const footerText = branding?.footerText

  return (
    <Html>
      <Head />
      <Preview>
        W-9 Form Request from {organizationName}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          {logoUrl && (
            <Section style={header}>
              <Img
                src={logoUrl}
                alt={organizationName}
                height="40"
                style={{ margin: '0 auto', maxWidth: '160px' }}
              />
            </Section>
          )}

          <Section style={content}>
            <Text style={greeting}>Hi {musicianName},</Text>

            <Text style={paragraph}>
              We need a completed <strong>W-9 form</strong> on file for all {term(t, 'person', { plural: true, case: 'lower' })} we work with.
            </Text>

            <Section style={infoBox}>
              <Text style={infoTitle}>What is a W-9?</Text>
              <Text style={infoText}>
                Form W-9 is used to provide your taxpayer identification number (TIN) to
                organizations that will pay you for your services. We use this information
                to report payments to the IRS on Form 1099.
              </Text>
            </Section>

            <Text style={paragraph}>
              <strong>Please complete and return your W-9 form at your earliest convenience.</strong>
            </Text>

            <Text style={paragraph}>
              You can download the official W-9 form from the IRS website at:{' '}
              <a href="https://www.irs.gov/forms-pubs/about-form-w-9" style={link}>
                https://www.irs.gov/forms-pubs/about-form-w-9
              </a>
            </Text>

            <Section style={stepsBox}>
              <Text style={stepsTitle}>How to submit your W-9:</Text>
              <Text style={stepsItem}>1. Download and complete the W-9 form</Text>
              <Text style={stepsItem}>2. Sign and date the form</Text>
              <Text style={stepsItem}>
                3. Reply to this email with the completed form attached
                {adminEmail && (
                  <span> or send it directly to <a href={`mailto:${adminEmail}`} style={link}>{adminEmail}</a></span>
                )}
              </Text>
            </Section>

            <Text style={smallText}>
              If you have already submitted a W-9 form to us, please disregard this message
              or let us know so we can update our records.
            </Text>
          </Section>

          <PodiumFooter
            organizationName={organizationName}
            footerText={footerText}
          />
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
  backgroundColor: '#eff6ff',
  border: '1px solid #1E293B',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '16px',
}

const infoTitle = {
  fontSize: '14px',
  fontWeight: 'bold',
  color: '#1e40af',
  marginBottom: '8px',
}

const infoText = {
  fontSize: '13px',
  color: '#1e40af',
  margin: '0',
  lineHeight: '20px',
}

const stepsBox = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '24px',
}

const stepsTitle = {
  fontSize: '14px',
  fontWeight: 'bold',
  color: '#1a1a1a',
  marginBottom: '12px',
}

const stepsItem = {
  fontSize: '14px',
  color: '#525f7f',
  marginBottom: '8px',
  paddingLeft: '8px',
}

const link = {
  color: '#1E293B',
  textDecoration: 'underline',
}

const smallText = {
  fontSize: '12px',
  color: '#8898aa',
  fontStyle: 'italic',
}

export default W9RequestEmail
