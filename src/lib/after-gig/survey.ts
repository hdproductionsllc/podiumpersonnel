export const OVERALL_LABELS = { great: 'Good', good: 'Minor issues', issues: 'Problem' } as const

export const DETAILS_LABELS = {
  matched: 'Matched',
  minor: 'Minor differences',
  significant: 'Significant differences',
} as const

export const FEEDBACK_LABELS = {
  positive: 'Positive',
  concern: 'Concern',
  none: 'None',
} as const

export type DetailsAccuracy = keyof typeof DETAILS_LABELS
export type ClientFeedback = keyof typeof FEEDBACK_LABELS

export interface SurveyDraft {
  overall: 'great' | 'good' | 'issues' | null
  allOnTime: boolean | null
  detailsAccuracy: DetailsAccuracy | null
  clientFeedback: ClientFeedback | null
  lateNotes: string
  clientFollowUp: string
  otherNotes: string
}

export const EMPTY_DRAFT: SurveyDraft = {
  overall: null, allOnTime: null, detailsAccuracy: null, clientFeedback: null,
  lateNotes: '', clientFollowUp: '', otherNotes: '',
}

// Browser storage is untrusted and may come from an older form version.
export function readDraft(raw: string | null): SurveyDraft {
  try {
    const value = JSON.parse(raw || 'null')
    if (!value || typeof value !== 'object') return { ...EMPTY_DRAFT }
    return {
      overall: ['great', 'good', 'issues'].includes(value.overall) ? value.overall : null,
      allOnTime: typeof value.allOnTime === 'boolean' ? value.allOnTime : null,
      detailsAccuracy: Object.hasOwn(DETAILS_LABELS, value.detailsAccuracy) ? value.detailsAccuracy : null,
      clientFeedback: Object.hasOwn(FEEDBACK_LABELS, value.clientFeedback) ? value.clientFeedback : null,
      lateNotes: typeof value.lateNotes === 'string' ? value.lateNotes.slice(0, 4000) : '',
      clientFollowUp: typeof value.clientFollowUp === 'string' ? value.clientFollowUp.slice(0, 4000) : '',
      otherNotes: typeof value.otherNotes === 'string' ? value.otherNotes.slice(0, 4000) : '',
    }
  } catch { return { ...EMPTY_DRAFT } }
}
