import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Link,
  Hr,
  Preview,
  Img,
} from '@react-email/components'
import { type EmailBranding } from './email-layout'

interface MusicReminderEmailProps {
  musicianName: string
  organizationName: string
  projectName: string
  files: {
    name: string
    size: number
    downloadUrl: string
  }[]
  confirmUrl: string
  branding?: EmailBranding
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function MusicReminderEmail({
  musicianName,
  organizationName,
  projectName,
  files,
  confirmUrl,
  branding,
}: MusicReminderEmailProps) {
  const brandColor = branding?.brandColor || '#1E293B'
  const logoUrl = branding?.logoUrl
  const footerText = branding?.footerText

  return (
    <Html>
      <Head />
      <Preview>
        Reminder: Download your music for {projectName}
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
            <Text style={greeting}>Hi {musicianName},</Text>

            <Text style={paragraph}>
              This is a reminder to download your music for <strong>{projectName}</strong>.
              Click each file below to download directly.
            </Text>

            <Text style={subheading}>Files:</Text>
            {files.map((file, index) => (
              <Section key={index} style={fileRow}>
                <Link href={file.downloadUrl} style={fileLink}>
                  {file.name}
                </Link>
                <Text style={fileSizeText}>
                  {formatFileSize(file.size)}
                </Text>
              </Section>
            ))}

            <Hr style={divider} />

            <Text style={paragraph}>
              After downloading, please confirm receipt:
            </Text>

            <Section style={buttonContainer}>
              <Button style={{ ...button, backgroundColor: brandColor }} href={confirmUrl}>
                Confirm Music Received
              </Button>
            </Section>

            <Text style={smallText}>
              Questions? Just reply to this email.
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

const subheading = {
  fontSize: '14px',
  fontWeight: 'bold' as const,
  color: '#1E293B',
  marginBottom: '12px',
}

const fileRow = {
  marginBottom: '8px',
  paddingLeft: '8px',
}

const fileLink = {
  fontSize: '14px',
  color: '#2563EB',
  textDecoration: 'underline',
  fontWeight: '500' as const,
}

const fileSizeText = {
  fontSize: '12px',
  color: '#8898aa',
  margin: '2px 0 0 0',
}

const divider = {
  borderColor: '#e6ebf1',
  margin: '24px 0',
}

const buttonContainer = {
  textAlign: 'center' as const,
  marginTop: '16px',
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

export default MusicReminderEmail
