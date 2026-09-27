import { Section, Text, Button, Preview } from '@react-email/components'
import { EmailLayout, emailStyles, getButtonStyle, type EmailBranding } from './email-layout'

// To the gig's lead musician. Deliberately carries NO pay information.
interface GigReportRequestEmailProps {
  organizationName: string
  leadFirstName: string
  projectName: string
  gigDate: string
  reportUrl: string
  branding?: EmailBranding
}

export function GigReportRequestEmail({
  organizationName,
  leadFirstName,
  projectName,
  gigDate,
  reportUrl,
  branding,
}: GigReportRequestEmailProps) {
  const brandColor = branding?.brandColor || '#1E293B'

  return (
    <EmailLayout organizationName={organizationName} branding={branding} previewText="">
      <Preview>{`How did ${projectName} go? Two minutes, no login.`}</Preview>
      <Section style={emailStyles.content}>
        <Text style={emailStyles.greeting}>Hi {leadFirstName || 'there'},</Text>
        <Text style={emailStyles.paragraph}>
          Thanks for leading <strong>{projectName}</strong> ({gigDate}). While it is fresh, how did it go?
        </Text>
        <Text style={emailStyles.paragraph}>
          A few quick questions: was everyone on time, were there any hiccups, is there anything we
          should follow up on with the client, and do any arrangements need work? It takes about two
          minutes and needs no login.
        </Text>

        <Section style={emailStyles.buttonContainer}>
          <Button style={getButtonStyle(brandColor)} href={reportUrl}>
            Send your gig report
          </Button>
        </Section>

        <Text style={emailStyles.smallText}>
          Only {organizationName}&apos;s owners and admins see your answers.
        </Text>
      </Section>
    </EmailLayout>
  )
}

export default GigReportRequestEmail
