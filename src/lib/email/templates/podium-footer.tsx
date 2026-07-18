import { Hr, Section, Text, Link } from '@react-email/components'
import * as React from 'react'

export const PODIUM_FOOTER_URL =
  'https://www.podiumpersonnel.com/?utm_source=transactional_email&utm_medium=footer&utm_campaign=recipient_referral'

interface PodiumFooterProps {
  organizationName: string
  footerText?: string | null
  verb?: 'email' | 'confirmation' | 'notification'
}

export function PodiumFooter({
  organizationName,
  footerText,
  verb = 'email',
}: PodiumFooterProps) {
  return (
    <>
      <Hr style={hr} />

      <Section style={footer}>
        {footerText && <Text style={footerTextStyle}>{footerText}</Text>}
        <Text style={footerTextStyle}>
          This {verb} was sent by {organizationName} via{' '}
          <Link href={PODIUM_FOOTER_URL} style={podiumLink}>
            Podium
          </Link>
          .
        </Text>
        <Text style={footerTextStyle}>
          If you have questions, please contact the organization directly.
        </Text>
      </Section>
    </>
  )
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

const podiumLink = {
  color: '#8898aa',
  textDecoration: 'underline',
}

export default PodiumFooter
