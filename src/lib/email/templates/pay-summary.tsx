import { Section, Text, Button, Hr, Preview, Row, Column } from '@react-email/components'
import { EmailLayout, emailStyles, getButtonStyle, type EmailBranding } from './email-layout'
import type { PaySummaryLine } from '@/lib/after-gig/rules'

// Sent ONLY to the org's owners and admins, never to musicians: it lists what
// every person on the gig is being paid.
interface PaySummaryEmailProps {
  organizationName: string
  projectName: string
  gigDate: string
  lines: PaySummaryLine[]
  grandTotal: number
  paymentsUrl: string
  needsGigLead?: boolean
  /**
   * The vertical's lead role ('Violin 1', the default when omitted), named in
   * the no-lead notice; null where no role leads by default (production_crew).
   */
  leadFallbackLabel?: string | null
  projectUrl?: string
  branding?: EmailBranding
}

export function formatMoney(amount: number): string {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  })
}

export function PaySummaryEmail({
  organizationName,
  projectName,
  gigDate,
  lines,
  grandTotal,
  paymentsUrl,
  needsGigLead,
  projectUrl,
  branding,
}: PaySummaryEmailProps) {
  const brandColor = branding?.brandColor || '#1E293B'
  const unpriced = lines.filter((l) => l.total <= 0)

  return (
    <EmailLayout organizationName={organizationName} branding={branding} previewText="">
      <Preview>{`Pay for ${projectName}: ${formatMoney(grandTotal)} across ${lines.length} ${lines.length === 1 ? 'person' : 'people'}`}</Preview>
      <Section style={emailStyles.content}>
        <Text style={emailStyles.greeting}>
          <strong>{projectName}</strong> is done. Here is what to pay each person.
        </Text>
        <Text style={emailStyles.paragraph}>{gigDate}</Text>

        <Section style={emailStyles.detailsBox}>
          {lines.map((line, i) => (
            <Row key={`${line.musicianId}-${i}`} style={row}>
              <Column style={nameCell}>
                {line.name}
                {line.instrument ? <span style={instrumentText}> · {line.instrument}</span> : null}
              </Column>
              <Column style={amountCell}>
                {line.total > 0 ? formatMoney(line.total) : 'no amount set'}
                {line.leaderFee > 0 ? (
                  <span style={breakdown}> ({formatMoney(line.basePay)} + {formatMoney(line.leaderFee)} leader fee)</span>
                ) : null}
              </Column>
            </Row>
          ))}
          <Hr style={emailStyles.hr} />
          <Row style={totalRow}>
            <Column style={nameCell}>Total</Column>
            <Column style={amountCell}>{formatMoney(grandTotal)}</Column>
          </Row>
        </Section>

        {unpriced.length > 0 && (
          <Text style={emailStyles.paragraph}>
            {unpriced.length === 1 ? 'One person has' : `${unpriced.length} people have`} no pay amount on this gig.
            Set it on the gig&apos;s pay, then generate payments.
          </Text>
        )}

        {needsGigLead && (
          <Text style={emailStyles.paragraph}>
            <strong>Confirm who played before requesting reports.</strong>{' '}
            {projectUrl ? <a href={projectUrl}>Review the played roster</a> : 'Review the played roster on the gig'} in its Gig reports panel.
          </Text>
        )}

        <Section style={emailStyles.buttonContainer}>
          <Button style={getButtonStyle(brandColor)} href={paymentsUrl}>
            Open Payments
          </Button>
        </Section>

        <Text style={emailStyles.smallText}>
          Amounts come from each accepted offer, or the gig&apos;s base pay plus any leader fee.
          This email goes to owners and admins only.
        </Text>
      </Section>
    </EmailLayout>
  )
}

const row = {
  fontSize: '14px',
  color: '#334155',
  margin: '0 0 8px 0',
  width: '100%',
}

const totalRow = {
  ...row,
  fontWeight: 'bold' as const,
  color: '#1a1a1a',
}

const nameCell = { padding: '8px 12px 8px 0', verticalAlign: 'top' as const, width: '55%' }

const amountCell = {
  textAlign: 'right' as const,
  padding: '8px 0',
  verticalAlign: 'top' as const,
}

const instrumentText = {
  color: '#64748b',
}

const breakdown = {
  color: '#64748b',
  fontSize: '12px',
  display: 'block' as const,
}

export default PaySummaryEmail
