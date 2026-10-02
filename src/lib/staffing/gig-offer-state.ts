import { hasLapsed, hasLiveStatus } from './live'

/**
 * What the gig page (/gig/[token]) tells the person an offer was sent to: one
 * plain sentence for every state an offer and its gig can be in.
 *
 * Before this the page had a sentence for some statuses only. An offer the
 * expire cron had collected ('expired') rendered no sentence and no buttons, and
 * a cancelled or finished gig read as "withdrawn by the organization", which
 * is not what happened (the plan, B1.4). Every state now has its own sentence,
 * and a status this code has never heard of still gets one ('closed').
 *
 * Pure: no I/O, safe in the browser. The page works out the inputs on the
 * server; the client component renders the result.
 */

export type GigOfferStateKey =
  /** Waiting on an answer: the Accept / Decline buttons. */
  | 'open'
  | 'accepted'
  | 'declined'
  /** Ran out before it was answered (collected by the cron, or not yet). */
  | 'expired'
  /** The organization withdrew it. */
  | 'rescinded'
  /** Replaced by a newer offer to the same person (or retired for another reason). */
  | 'superseded'
  /** Let go after accepting (a substitute took over, unassigned, or dropped out). */
  | 'released'
  /** Someone else holds the chair now, so this offer is closed. */
  | 'filled_by_other'
  | 'gig_cancelled'
  /** The gig has happened; an unanswered offer is closed. */
  | 'gig_completed'
  /** A status this code does not know: closed, never blank. */
  | 'closed'

export type GigOfferTone = 'success' | 'danger' | 'warning' | 'neutral'

export interface GigOfferState {
  key: GigOfferStateKey
  /** The sentence; null only for 'open', where the buttons say it. */
  message: string | null
  tone: GigOfferTone
}

export interface GigOfferStateInput {
  offerStatus: string | null | undefined
  expiresAt?: string | null
  /** projects.status: draft | active | completed | cancelled. */
  projectStatus?: string | null
  /** musicians.is_active; false closes a live offer (the accept route refuses it). */
  musicianActive?: boolean | null
  /** Someone other than this person holds the chair (and this is not a substitute's offer). */
  chairHeldByOther?: boolean
  /** The organization vertical's word for the gig, lowercase ("project", "production"). */
  workTerm?: string
  /** Its word for the chair, lowercase, or '' for a vertical without chairs. */
  rankTerm?: string
  organizationName?: string
  /** Why a 'released' offer was released, when the page knows: 'dropped' = the worker said they can't make it. */
  releasedReason?: string | null
  now?: Date
}

const NO_RESPONSE = 'No response is needed.'

/** The one sentence for this offer, and how loudly to say it. */
export function describeGigOffer(input: GigOfferStateInput): GigOfferState {
  const status = input.offerStatus ?? ''
  const work = input.workTerm || 'project'
  const rank = input.rankTerm || 'spot'
  const org = input.organizationName || 'the organization'
  const live = hasLiveStatus(status)
  const lapsed = live && hasLapsed(input.expiresAt, input.now)

  // A cancelled gig outranks everything: whatever happened to the offer, the
  // thing it was for is not happening.
  if (input.projectStatus === 'cancelled') {
    return {
      key: 'gig_cancelled',
      tone: 'warning',
      message:
        status === 'accepted'
          ? `This ${work} has been cancelled, so you are no longer booked for it. No action is needed.`
          : `This ${work} has been cancelled. ${NO_RESPONSE}`,
    }
  }

  // A finished gig closes an unanswered offer. Every other status keeps its
  // own sentence: an accepted musician did play, a declined one did decline.
  if (input.projectStatus === 'completed' && live) {
    return { key: 'gig_completed', tone: 'neutral', message: `This ${work} has already taken place, so this offer is closed. ${NO_RESPONSE}` }
  }

  if (live && input.musicianActive === false) {
    return { key: 'rescinded', tone: 'warning', message: `This offer was withdrawn by the organization. ${NO_RESPONSE}` }
  }

  // Another person has the chair: say that, rather than "expired" or
  // "replaced", which leave the reader wondering whether to chase it.
  if (input.chairHeldByOther && (lapsed || status === 'expired' || status === 'superseded')) {
    return {
      key: 'filled_by_other',
      tone: 'neutral',
      message: `This ${rank} has been filled by someone else, so this offer is closed. ${NO_RESPONSE}`,
    }
  }

  if (lapsed || status === 'expired') {
    return {
      key: 'expired',
      tone: 'warning',
      message: `This offer has expired and can no longer be accepted. If you are still available, please contact ${org}.`,
    }
  }

  if (live) return { key: 'open', tone: 'neutral', message: null }

  switch (status) {
    case 'accepted':
      return { key: 'accepted', tone: 'success', message: 'You have accepted this offer.' }
    case 'declined':
      return { key: 'declined', tone: 'danger', message: 'You have declined this offer.' }
    case 'rescinded':
      return { key: 'rescinded', tone: 'warning', message: `This offer was withdrawn by the organization. ${NO_RESPONSE}` }
    case 'superseded':
      return {
        key: 'superseded',
        tone: 'warning',
        message: `This offer has been replaced and is no longer open. ${NO_RESPONSE} If you received a newer offer, please answer that one.`,
      }
    case 'released':
      if (input.releasedReason === 'dropped') {
        return {
          key: 'released',
          tone: 'neutral',
          message: `You let ${org} know you can't make it, so you are no longer booked for this ${work}. No action is needed.`,
        }
      }
      return { key: 'released', tone: 'neutral', message: 'You have been released from this engagement. No action is needed.' }
    default:
      return { key: 'closed', tone: 'neutral', message: `This offer is no longer open. ${NO_RESPONSE}` }
  }
}
