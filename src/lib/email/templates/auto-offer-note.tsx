import { Section, Text } from '@react-email/components'
import { term, DEFAULT_TERMS, type TermDictionary } from '@/lib/verticals'

/**
 * What the auto-cascade did after an offer was declined or expired, for the
 * admin's notice of that decline or expiry. Only passed when the organization
 * has auto-offer on and Podium acted; without it the notices read exactly as
 * they always have.
 */
export type AutoOfferNote =
  /** Podium offered the position to the next person on the same terms. */
  | {
      kind: 'offered'
      musicianName: string
      /** When the new offer runs out (ISO), shown in the organization's timezone. */
      expiresAt: string | null
      timezone?: string
      /** The new offer exists but its email did not go out. */
      emailFailed?: boolean
    }
  /** Nobody on the list is free; the admins get a separate "please pick someone" email. */
  | { kind: 'exhausted' }

export function formatAutoOfferDeadline(expiresAt: string, timezone?: string): string {
  return new Date(expiresAt).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(timezone ? { timeZone: timezone } : {}),
  })
}

export function AutoOfferNoteSection({ note, terms }: { note: AutoOfferNote; terms?: TermDictionary }) {
  const t = terms ?? DEFAULT_TERMS
  const person = term(t, 'person', { case: 'lower' })

  if (note.kind === 'exhausted') {
    return (
      <Section style={exhaustedBox}>
        <Text style={exhaustedText}>
          Auto-offer: Podium tried to offer this position to the next {person} on your list, but nobody left on it is
          free. Please pick someone.
        </Text>
      </Section>
    )
  }

  return (
    <Section style={offeredBox}>
      <Text style={offeredTitle}>Offered automatically</Text>
      <Text style={offeredText}>
        Podium offered this position to <strong>{note.musicianName}</strong> on the same terms
        {note.expiresAt ? `. They have until ${formatAutoOfferDeadline(note.expiresAt, note.timezone)} to answer.` : '.'}
      </Text>
      {note.emailFailed && (
        <Text style={warningText}>
          The email to {note.musicianName} could not be sent. Open the dashboard and use Send Reminder, or contact
          them directly.
        </Text>
      )}
    </Section>
  )
}

const offeredBox = {
  backgroundColor: '#eff6ff',
  border: '1px solid #3b82f6',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '16px',
}

const offeredTitle = {
  fontSize: '14px',
  fontWeight: 'bold',
  color: '#1e40af',
  margin: '0 0 4px 0',
}

const offeredText = {
  fontSize: '14px',
  color: '#525f7f',
  margin: '0',
}

const warningText = {
  fontSize: '14px',
  color: '#b45309',
  margin: '8px 0 0 0',
}

const exhaustedBox = {
  backgroundColor: '#fef2f2',
  border: '1px solid #fca5a5',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '16px',
}

const exhaustedText = {
  fontSize: '14px',
  color: '#991b1b',
  margin: '0',
}
