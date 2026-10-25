import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@react-email/render'

/**
 * The gig report asks about the client (David, 2026-10-04): did the lead deal
 * with the client, and how did it go? Saved with the report (migration 101),
 * shown to the admins, and a negative experience flags "Needs attention".
 */

const state = vi.hoisted(() => ({ update: null as Record<string, unknown> | null, answers: null as Record<string, unknown> | null, saved: true, saveError: false, conditions: [] as unknown[] }))

vi.mock('@/lib/after-gig/report-token', () => ({
  resolveGigReportToken: vi.fn(async () => ({
    reportId: 'rep-1',
    organizationId: 'org-1',
    projectId: 'proj-1',
    musicianId: 'mus-1',
    openedAt: null,
    submittedAt: null,
    leadFirstName: 'Shelly',
    leadName: 'Shelly Ren',
    projectName: 'Smith Wedding',
    organizationName: 'Subito Strings',
    timezone: 'America/Chicago',
    services: [{ name: 'Ceremony', start_time: '2026-11-07T22:00:00Z', end_time: null }],
    branding: { logoUrl: null, brandColor: null, footerText: null },
  })),
}))

vi.mock('@/lib/supabase/server', () => {
  const chain = {
    update(payload: Record<string, unknown>) {
      state.update = payload
      return chain
    },
    eq: (...args: unknown[]) => { state.conditions.push(args); return chain },
    is: (...args: unknown[]) => { state.conditions.push(args); return chain },
    select: async () => ({ data: state.saved ? [{ id: 'rep-1' }] : [], error: state.saveError ? { message: 'offline' } : null }),
  }
  return {
    createServiceClient: () => ({ from: () => chain }),
    getOrgAdminEmails: vi.fn(async () => ['owner@example.com']),
  }
})

vi.mock('@/lib/notify', () => ({
  notify: async (_event: unknown, content: { email: () => Promise<unknown> }) => content.email(),
}))

vi.mock('@/lib/email/send', () => ({
  sendGigReportSubmittedEmail: vi.fn(async (params: { answers: Record<string, unknown> }) => {
    state.answers = params.answers
    return { id: 'em-1' }
  }),
}))

import { POST } from '@/app/api/report/[token]/route'
import { GigReportSubmittedEmail, reportNeedsAttention, clientSummary, type GigReportAnswers } from '@/lib/email/templates/gig-report-submitted'

let tokenSeq = 0
async function submit(body: Record<string, unknown>) {
  // A fresh token per submit: the route rate-limits per token.
  const token = (++tokenSeq).toString(16).padStart(64, 'a')
  const res = await POST(new Request(`http://localhost/api/report/${token}`, { method: 'POST', body: JSON.stringify(body) }), {
    params: Promise.resolve({ token }),
  })
  return { status: res.status, body: await res.json() }
}

const BASE = { overall: 'great', allOnTime: true }

describe('the report saves the client answers', () => {
  beforeEach(() => {
    state.update = null
    state.answers = null
  })

  it('yes, and how it went', async () => {
    const res = await submit({ ...BASE, clientInteracted: true, clientExperience: 'positive' })
    expect(res.status).toBe(200)
    expect(state.update).toMatchObject({ client_interacted: true, client_experience: 'positive' })
    expect(state.answers).toMatchObject({ clientInteracted: true, clientExperience: 'positive' })
  })

  it('no: how it went is not kept, even if the form sent one', async () => {
    await submit({ ...BASE, clientInteracted: false, clientExperience: 'negative' })
    expect(state.update).toMatchObject({ client_interacted: false, client_experience: null })
  })

  it('a form opened before the questions existed still submits', async () => {
    const res = await submit(BASE)
    expect(res.status).toBe(200)
    expect(state.update).toMatchObject({ client_interacted: null, client_experience: null })
  })

  it('rejects a made-up answer', async () => {
    const res = await submit({ ...BASE, clientInteracted: true, clientExperience: 'amazing' })
    expect(res.status).toBe(400)
  })
})

describe('the admins see it', () => {
  const answers = (over: Partial<GigReportAnswers> = {}): GigReportAnswers => ({
    overall: 'great', allOnTime: true, lateNotes: null, hiccups: null, clientFollowUp: null,
    arrangementNotes: null, otherNotes: null, ...over,
  })

  it('in plain words', () => {
    expect(clientSummary({ clientInteracted: true, clientExperience: 'positive' })).toBe('Interacted with the client: Positive')
    expect(clientSummary({ clientInteracted: false })).toBe('Did not interact with the client')
    expect(clientSummary({})).toBeNull()
  })

  it('a negative experience needs attention; positive and neutral do not', () => {
    expect(reportNeedsAttention(answers({ clientInteracted: true, clientExperience: 'negative' }))).toBe(true)
    expect(reportNeedsAttention(answers({ clientInteracted: true, clientExperience: 'neutral' }))).toBe(false)
    expect(reportNeedsAttention(answers({ clientInteracted: true, clientExperience: 'positive' }))).toBe(false)
  })

  it('in the report email', async () => {
    const html = await render(
      GigReportSubmittedEmail({
        organizationName: 'Subito Strings', leadName: 'Shelly Ren', projectName: 'Smith Wedding', gigDate: 'November 7, 2026',
        answers: answers({ clientInteracted: true, clientExperience: 'negative' }), projectUrl: 'https://app.example.test/p',
      })
    )
    expect(html).toContain('Interacted with the client: Negative')
    expect(html).toContain('Needs attention')
  })

  it('an older report without the answers renders as before', async () => {
    const html = await render(
      GigReportSubmittedEmail({
        organizationName: 'Subito Strings', leadName: 'Shelly Ren', projectName: 'Smith Wedding', gigDate: 'November 7, 2026',
        answers: answers(), projectUrl: 'https://app.example.test/p',
      })
    )
    expect(html).not.toContain('The client')
    expect(html).not.toContain('Needs attention')
  })
})

describe('concise survey compatibility', () => {
  it.each(['matched', 'minor', 'significant'])('saves %s without an explanation', async (detailsAccuracy) => {
    expect((await submit({ ...BASE, detailsAccuracy })).status).toBe(200)
    expect(state.update).toMatchObject({ details_accuracy: detailsAccuracy, client_feedback: null, other_notes: null })
    expect(state.answers).toMatchObject({ detailsAccuracy })
  })
  it.each(['positive', 'concern', 'none'])('saves optional client feedback: %s', async (clientFeedback) => {
    expect((await submit({ ...BASE, detailsAccuracy: 'minor', clientFeedback })).status).toBe(200)
    expect(state.update).toMatchObject({ client_feedback: clientFeedback })
  })
  it('rejects invalid new choices', async () => {
    expect((await submit({ ...BASE, detailsAccuracy: 'no' })).status).toBe(400)
    expect((await submit({ ...BASE, clientFeedback: 'neutral' })).status).toBe(400)
  })
  it('renders differences and feedback in admin email without losing old fields', async () => {
    const html = await render(GigReportSubmittedEmail({
      organizationName: 'Quartet', leadName: 'Lead', projectName: 'Wedding', gigDate: '', projectUrl: 'https://example.test',
      answers: { overall: 'good', allOnTime: true, lateNotes: null, hiccups: 'Legacy hiccup', clientFollowUp: null, arrangementNotes: 'Legacy arrangement', otherNotes: null, detailsAccuracy: 'minor', clientFeedback: 'positive' },
    }))
    expect(html).toContain('Minor differences')
    expect(html).toContain('Positive')
    expect(html).toContain('Legacy hiccup')
    expect(html).toContain('Legacy arrangement')
    expect(html).not.toContain('Needs attention')
  })
})

it('locks an already-submitted report and does not notify again', async () => {
  state.saved = false; state.answers = null; state.conditions = []
  try {
    const result = await submit({ ...BASE, detailsAccuracy: 'significant' })
    expect(result).toEqual({ status: 409, body: { error: 'Already sent', alreadySubmitted: true } })
    expect(state.answers).toBeNull()
    expect(state.conditions).toContainEqual(['submitted_at', null])
    expect(state.conditions).toContainEqual(['id', 'rep-1'])
  } finally { state.saved = true }
})

it('a failed save is retryable and cannot send the notification', async () => {
  state.saveError = true; state.answers = null
  try {
    expect((await submit({ ...BASE, detailsAccuracy: 'minor' })).status).toBe(500)
    expect(state.answers).toBeNull()
    state.saveError = false
    expect((await submit({ ...BASE, detailsAccuracy: 'minor' })).status).toBe(200)
  } finally { state.saveError = false }
})
