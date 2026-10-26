'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { SupportLink } from '@/components/ui/support-link'
import { DETAILS_LABELS, FEEDBACK_LABELS, EMPTY_DRAFT, readDraft, type SurveyDraft } from '@/lib/after-gig/survey'
import { GigReportPhotos } from './gig-report-photos'

interface GigReportClientProps {
  token: string
  leadFirstName: string
  organizationName: string
  projectName: string
  gigDate: string
  alreadySubmitted: boolean
  submitError?: boolean
  brandColor: string | null
}

export const REPORT_TEXT_LIMIT = 4000

export function GigReportClient({ token, leadFirstName, organizationName, projectName, gigDate, alreadySubmitted, brandColor, submitError }: GigReportClientProps) {
  const [submitted, setSubmitted] = useState(alreadySubmitted)
  const [draft, setDraft] = useState<SurveyDraft>({ ...EMPTY_DRAFT })
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(submitError ? 'Could not save your report. Please check your answers and try again.' : null)
  const storageKey = `gig-report-draft:${token}`

  useEffect(() => {
    try {
      if (alreadySubmitted) sessionStorage.removeItem(storageKey)
      else setDraft(readDraft(sessionStorage.getItem(storageKey)))
    } catch { /* Private browsing can disable storage; the form still works. */ }
    setReady(true)
  }, [storageKey, alreadySubmitted])

  useEffect(() => {
    if (!ready) return
    try {
      if (submitted) sessionStorage.removeItem(storageKey)
      else sessionStorage.setItem(storageKey, JSON.stringify(draft))
    } catch { /* Keep the in-memory draft when browser storage is unavailable. */ }
  }, [draft, ready, storageKey, submitted])

  function update<K extends keyof SurveyDraft>(key: K, value: SurveyDraft[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    if (!draft.overall || draft.allOnTime === null || !draft.detailsAccuracy) {
      setError('Please answer overall, punctuality and gig details. All notes are optional.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/report/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, lateNotes: draft.allOnTime ? '' : draft.lateNotes }),
      })
      const data = await res.json().catch(() => ({}))
      if (!(res.ok && data.success === true) && !(res.status === 409 && data.alreadySubmitted === true)) {
        throw new Error(data.error || 'Could not confirm your report was saved. Please try again.')
      }
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally { setLoading(false) }
  }

  const choice = (active: boolean) => `min-h-11 rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`
  const notes = (key: 'lateNotes' | 'clientFollowUp' | 'otherNotes', label: string) => (
    <div className="space-y-1.5">
      <label htmlFor={key} className="text-sm font-medium text-slate-900">{label}</label>
      <Textarea id={key} name={key} value={draft[key]} maxLength={REPORT_TEXT_LIMIT} onChange={(e) => update(key, e.target.value)} rows={2} className="bg-white" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-start justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-lg border overflow-hidden">
        <div className="bg-slate-900 px-6 py-5 text-center" style={brandColor ? { backgroundColor: brandColor } : undefined}>
          <h1 className="text-white text-lg font-semibold">{organizationName}</h1>
        </div>
        <div className="p-5 sm:p-6 space-y-6">
          {submitted ? (
            <div role="status" className="text-center space-y-3 py-4">
              <h2 className="text-xl font-bold text-green-800">Thank you!</h2>
              <p>Your report on <strong>{projectName}</strong> is with the team.</p>
              <p className="text-sm text-slate-600">You can still add optional photos below.</p>
            </div>
          ) : (
            <form method="post" action={`/api/report/${token}`} onSubmit={handleSubmit} className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold">Hi {leadFirstName || 'there'}, how did it go?</h2>
                <p className="text-sm text-slate-600 mt-1">{projectName}{gigDate ? ` · ${gigDate}` : ''}</p>
                <p className="text-xs text-slate-500 mt-2">Three quick answers. All notes and client feedback are optional. Only {organizationName}&apos;s owners and admins see this.</p>
              </div>
              <fieldset disabled={loading} className="space-y-5">
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">How did the gig go overall?</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {([['great', 'Good'], ['good', 'Minor issues'], ['issues', 'Problem']] as const).map(([value, label]) => (
                      <label key={value} className={choice(draft.overall === value)}><input type="radio" name="overall" value={value} required checked={draft.overall === value} onChange={() => update('overall', value)} className="mr-2" />{label}</label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Was everyone on time?</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {[true, false].map((value) => <label key={String(value)} className={choice(draft.allOnTime === value)}><input type="radio" name="allOnTime" value={String(value)} required checked={draft.allOnTime === value} onChange={() => update('allOnTime', value)} className="mr-2" />{value ? 'Yes' : 'No'}</label>)}
                  </div>
                  {notes('lateNotes', 'Punctuality note (optional)')}
                </fieldset>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Did the gig match the details you were sent?</legend>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(Object.keys(DETAILS_LABELS) as Array<NonNullable<SurveyDraft['detailsAccuracy']>>).map((value) => <label key={value} className={choice(draft.detailsAccuracy === value)}><input type="radio" name="detailsAccuracy" value={value} required checked={draft.detailsAccuracy === value} onChange={() => update('detailsAccuracy', value)} className="mr-2" />{DETAILS_LABELS[value]}</label>)}
                  </div>
                  <p className="text-xs text-slate-500">No explanation needed. Add a note below if useful.</p>
                </fieldset>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Any client feedback? (optional)</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(FEEDBACK_LABELS) as Array<NonNullable<SurveyDraft['clientFeedback']>>).map((value) => <label key={value} className={choice(draft.clientFeedback === value)}><input type="radio" name="clientFeedback" value={value} checked={draft.clientFeedback === value} onChange={() => update('clientFeedback', value)} className="mr-2" />{FEEDBACK_LABELS[value]}</label>)}
                  </div>
                  <label className="text-sm"><input type="radio" name="clientFeedback" value="" checked={draft.clientFeedback === null} onChange={() => update('clientFeedback', null)} /> Skip client feedback</label>
                  {notes('clientFollowUp', 'Client note (optional)')}
                </fieldset>
                {notes('otherNotes', 'Anything else? (optional)')}
              </fieldset>
              {error && <div role="alert" className="text-sm text-red-600"><p>{error}</p><p className="mt-1">Having trouble? <SupportLink subject="Help sending a gig report" /></p></div>}
              <Button type="submit" className="w-full" size="lg" disabled={loading}>{loading ? 'Sending…' : 'Send report'}</Button>
            </form>
          )}
          <noscript><p className="text-sm">You can send this form without JavaScript. Optional photo uploads need JavaScript enabled in your browser.</p></noscript>
          <GigReportPhotos token={token} />
        </div>
      </div>
    </div>
  )
}
