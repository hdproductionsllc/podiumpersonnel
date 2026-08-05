import { Section, Text, Preview } from '@react-email/components'
import { EmailLayout, emailStyles, type EmailBranding } from './email-layout'

/**
 * The client song planner invitation and its nudges (082).
 *
 * Written for a couple, not for a contractor: no jargon, no mention of intakes,
 * repertoire or books, and nothing about what we do or don't already have
 * arranged — the library is never advertised to a client (spec §4).
 *
 * One template, three tones. A reminder that reads like a fresh invitation makes
 * people think the first one never arrived; a due-day nudge that reads like a
 * reminder gets ignored.
 */

export type SongPlannerVariant = 'invite' | 'reminder' | 'due'

interface SongPlannerEmailProps {
  clientName: string
  organizationName: string
  plannerUrl: string
  /** The event date, ISO. Shown so they know which booking this is. */
  eventDate?: string | null
  dueAt?: string | null
  variant: SongPlannerVariant
  branding?: EmailBranding
}

function formatDate(value?: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function SongPlannerEmail({
  clientName,
  organizationName,
  plannerUrl,
  eventDate,
  dueAt,
  variant,
  branding,
}: SongPlannerEmailProps) {
  const brandColor = branding?.brandColor || '#1E293B'
  const eventOn = formatDate(eventDate)
  const dueOn = formatDate(dueAt)

  const preview =
    variant === 'invite'
      ? `Choose the music for your day with ${organizationName}`
      : variant === 'due'
        ? 'Your music selections are due today'
        : 'A gentle nudge about your music selections'

  return (
    <EmailLayout organizationName={organizationName} branding={branding} previewText={preview}>
      <Preview>{preview}</Preview>
      <Section style={emailStyles.content}>
        <Text style={emailStyles.greeting}>Hi {clientName},</Text>

        {variant === 'invite' && (
          <>
            <Text style={emailStyles.paragraph}>
              We&apos;re looking forward to playing for you
              {eventOn ? <> on <strong>{eventOn}</strong></> : null}. When you&apos;re ready, you can
              choose your music using the link below.
            </Text>
            <Text style={emailStyles.paragraph}>
              Add whatever you&apos;d like to hear and put it in the order you want it played.
              There&apos;s no need to finish in one go — your list saves as you type, so you can
              come back to it whenever you like.
            </Text>
          </>
        )}

        {variant === 'reminder' && (
          <Text style={emailStyles.paragraph}>
            Just a friendly nudge about the music for your event
            {eventOn ? <> on <strong>{eventOn}</strong></> : null}. Your list is right where you
            left it — pick up whenever you have a moment.
          </Text>
        )}

        {variant === 'due' && (
          <Text style={emailStyles.paragraph}>
            Your music selections are due today. If you need more time, just reply to this
            email and we&apos;ll sort it out — but the sooner we have your list, the more time
            we have to prepare it properly.
          </Text>
        )}

        {dueOn && variant !== 'due' && (
          <Section style={emailStyles.detailsBox}>
            <Text style={emailStyles.detailsItem}>
              <strong>Please have your list in by:</strong> {dueOn}
            </Text>
            <Text style={emailStyles.detailsItem}>
              That gives us time to prepare the music before your date.
            </Text>
          </Section>
        )}

        <Section style={emailStyles.buttonContainer}>
          <a href={plannerUrl} style={{ ...button, backgroundColor: brandColor }}>
            {variant === 'invite' ? 'Choose our music' : 'Finish our music list'}
          </a>
        </Section>

        <Text style={emailStyles.smallText}>
          This link is just for you — no account or password needed. Please don&apos;t forward it.
        </Text>

        <Text style={emailStyles.paragraph}>
          Any questions at all, simply reply to this email.
        </Text>
      </Section>
    </EmailLayout>
  )
}

const button = {
  borderRadius: '6px',
  color: '#fff',
  fontSize: '14px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 24px',
}

export default SongPlannerEmail
