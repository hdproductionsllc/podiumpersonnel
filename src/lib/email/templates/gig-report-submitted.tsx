import { Section, Text, Button, Preview } from '@react-email/components'
import { EmailLayout, emailStyles, getButtonStyle, type EmailBranding } from './email-layout'

// To the org's owners and admins when a lead submits their gig report.
export interface GigReportAnswers {
  overall: 'great' | 'good' | 'issues' | null
  allOnTime: boolean | null
  lateNotes: string | null
  hiccups: string | null
  clientFollowUp: string | null
  /** Did the lead deal with the client? Null on reports from before 2026-10-04. */
  clientInteracted?: boolean | null
  clientExperience?: 'positive' | 'neutral' | 'negative' | null
  arrangementNotes: string | null
  otherNotes: string | null
}

export const CLIENT_EXPERIENCE_LABELS: Record<NonNullable<GigReportAnswers['clientExperience']>, string> = {
  positive: 'Positive',
  neutral: 'Neutral',
  negative: 'Negative',
}

/** "Talked with them: Positive", "Did not interact", or null when not answered. */
export function clientSummary(answers: Pick<GigReportAnswers, 'clientInteracted' | 'clientExperience'>): string | null {
  if (answers.clientInteracted === false) return 'Did not interact with the client'
  if (answers.clientInteracted !== true) return null
  return answers.clientExperience
    ? `Interacted with the client: ${CLIENT_EXPERIENCE_LABELS[answers.clientExperience]}`
    : 'Interacted with the client'
}

/** The report gets a "Needs attention" flag (subject and badge) when any of these hold. */
export function reportNeedsAttention(answers: GigReportAnswers): boolean {
  return (
    answers.overall === 'issues' ||
    answers.allOnTime === false ||
    !!answers.clientFollowUp ||
    answers.clientExperience === 'negative'
  )
}

interface GigReportSubmittedEmailProps {
  organizationName: string
  leadName: string
  projectName: string
  gigDate: string
  answers: GigReportAnswers
  projectUrl: string
  branding?: EmailBranding
}

export const OVERALL_LABELS: Record<NonNullable<GigReportAnswers['overall']>, string> = {
  great: 'Went great',
  good: 'Went fine, small things',
  issues: 'There were problems',
}

export function GigReportSubmittedEmail({
  organizationName,
  leadName,
  projectName,
  gigDate,
  answers,
  projectUrl,
  branding,
}: GigReportSubmittedEmailProps) {
  const brandColor = branding?.brandColor || '#1E293B'
  const needsAttention = reportNeedsAttention(answers)

  const item = (label: string, value: string | null) =>
    value ? (
      <Section style={answerBlock}>
        <Text style={answerLabel}>{label}</Text>
        <Text style={answerText}>{value}</Text>
      </Section>
    ) : null

  return (
    <EmailLayout organizationName={organizationName} branding={branding} previewText="">
      <Preview>{`${leadName}'s report on ${projectName}${needsAttention ? ' — needs attention' : ''}`}</Preview>
      <Section style={emailStyles.content}>
        {needsAttention && <Text style={attentionBadge}>Needs attention</Text>}
        <Text style={emailStyles.greeting}>
          <strong>{leadName}</strong> sent the gig report for <strong>{projectName}</strong> ({gigDate}).
        </Text>

        <Section style={emailStyles.detailsBox}>
          {item('Overall', answers.overall ? OVERALL_LABELS[answers.overall] : null)}
          {item(
            'Everyone on time?',
            answers.allOnTime === null ? null : answers.allOnTime ? 'Yes' : `No${answers.lateNotes ? ` — ${answers.lateNotes}` : ''}`,
          )}
          {item('The client', clientSummary(answers))}
          {item('Hiccups', answers.hiccups)}
          {item('Follow up with the client', answers.clientFollowUp)}
          {item('Arrangements that need work', answers.arrangementNotes)}
          {item('Anything else', answers.otherNotes)}
        </Section>

        <Section style={emailStyles.buttonContainer}>
          <Button style={getButtonStyle(brandColor)} href={projectUrl}>
            Open the gig
          </Button>
        </Section>
      </Section>
    </EmailLayout>
  )
}

const answerBlock = { marginBottom: '12px' }
const answerLabel = { fontSize: '12px', fontWeight: 'bold' as const, color: '#64748b', margin: '0 0 2px 0', textTransform: 'uppercase' as const, letterSpacing: '0.4px' }
const answerText = { fontSize: '14px', color: '#1a1a1a', margin: '0', whiteSpace: 'pre-wrap' as const }
const attentionBadge = {
  color: '#ffffff',
  backgroundColor: '#dc2626',
  fontSize: '12px',
  fontWeight: 'bold' as const,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  padding: '4px 10px',
  borderRadius: '4px',
  display: 'inline-block',
  marginBottom: '16px',
}

export default GigReportSubmittedEmail
