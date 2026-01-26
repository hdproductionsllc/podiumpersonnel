import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Hr,
  Img,
} from '@react-email/components'
import * as React from 'react'

export interface EmailBranding {
  logoUrl?: string | null
  brandColor?: string | null
  footerText?: string | null
}

interface EmailLayoutProps {
  organizationName: string
  branding?: EmailBranding
  previewText: string
  children: React.ReactNode
}

export function EmailLayout({
  organizationName,
  branding,
  previewText,
  children,
}: EmailLayoutProps) {
  const brandColor = branding?.brandColor || '#3b82f6'
  const logoUrl = branding?.logoUrl
  const footerText = branding?.footerText

  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={{ ...header, backgroundColor: brandColor }}>
            {logoUrl ? (
              <Img
                src={logoUrl}
                alt={organizationName}
                height="48"
                style={logo}
              />
            ) : (
              <Text style={heading}>{organizationName}</Text>
            )}
          </Section>

          {children}

          <Hr style={hr} />

          <Section style={footer}>
            {footerText && (
              <Text style={footerText as React.CSSProperties}>{footerText}</Text>
            )}
            <Text style={footerTextStyle}>
              This email was sent by {organizationName} via Podium.
            </Text>
            <Text style={footerTextStyle}>
              If you have questions, please contact the organization directly.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

// Export styles for use in templates
export const emailStyles = {
  main: {
    backgroundColor: '#f6f9fc',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
  },
  container: {
    backgroundColor: '#ffffff',
    margin: '0 auto',
    padding: '20px 0 48px',
    marginBottom: '64px',
    maxWidth: '600px',
  },
  content: {
    padding: '24px',
  },
  greeting: {
    fontSize: '16px',
    lineHeight: '24px',
    marginBottom: '16px',
  },
  paragraph: {
    fontSize: '14px',
    lineHeight: '22px',
    color: '#525f7f',
    marginBottom: '16px',
  },
  detailsBox: {
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '24px',
  },
  detailsTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: '8px',
  },
  detailsItem: {
    fontSize: '14px',
    color: '#525f7f',
    marginBottom: '4px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: '12px',
  },
  buttonContainer: {
    textAlign: 'center' as const,
    marginTop: '24px',
    marginBottom: '16px',
  },
  smallText: {
    fontSize: '12px',
    color: '#8898aa',
    textAlign: 'center' as const,
  },
  hr: {
    borderColor: '#e6ebf1',
    margin: '20px 0',
  },
}

// Styles for layout
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

const logo = {
  margin: '0 auto',
  maxWidth: '200px',
}

const heading = {
  color: '#ffffff',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '0',
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

// Helper function to create button style with brand color
export function getButtonStyle(brandColor: string) {
  return {
    backgroundColor: brandColor,
    borderRadius: '6px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 'bold',
    textDecoration: 'none',
    textAlign: 'center' as const,
    display: 'inline-block',
    padding: '12px 24px',
  }
}

// Helper function to create service row border with brand color
export function getServiceRowStyle(brandColor: string) {
  return {
    backgroundColor: '#f8fafc',
    borderLeft: `3px solid ${brandColor}`,
    padding: '12px 16px',
    marginBottom: '8px',
  }
}

export default EmailLayout
