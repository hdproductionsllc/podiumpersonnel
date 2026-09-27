'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

/**
 * The lead musician's after-gig report, on the gig's row.
 *
 * Leads are the confirmed musicians flagged leader on the roster. The request
 * goes out automatically 30 minutes after the gig ends (after-gig cron); this
 * panel shows where each lead is and lets an admin send it now or again.
 */

export interface GigReportRow {
  id: string
  project_id: string
  musician_id: string
  requested_at: string
  opened_at: string | null
  submitted_at: string | null
  overall: 'great' | 'good' | 'issues' | null
  all_on_time: boolean | null
  late_notes: string | null
  hiccups: string | null
  client_follow_up: string | null
  arrangement_notes: string | null
  other_notes: string | null
  musician: { first_name: string | null; last_name: string | null } | null
}

interface PositionLike {
  status: string
  musician_id: string | null
  musician?: { id: string; first_name: string | null; last_name: string | null } | null
}

interface GigReportPanelProps {
  projectId: string
  positions: PositionLike[]
  leaderIds: string[]
  reports: GigReportRow[]
  timezone: string
}

const OVERALL: Record<NonNullable<GigReportRow['overall']>, { label: string; className: string }> = {
  great: { label: 'Went great', className: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' },
  good: { label: 'Fine, small things', className: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200' },
  issues: { label: 'There were problems', className: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' },
}

function name(m: { first_name: string | null; last_name: string | null } | null | undefined) {
  return [m?.first_name, m?.last_name].filter(Boolean).join(' ') || 'Lead'
}

export function GigReportPanel({ projectId, positions, leaderIds, reports, timezone }: GigReportPanelProps) {
  const router = useRouter()
  const [sending, setSending] = useState(false)

  const leaderSet = new Set(leaderIds)
  const leads = Array.from(
    new Map(
      positions
        .filter((p) => p.status === 'confirmed' && p.musician_id && leaderSet.has(p.musician_id))
        .map((p) => [p.musician_id!, p.musician])
    ).entries()
  )

  const when = (iso: string) =>
    new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timezone })

  const allSubmitted = leads.length > 0 && leads.every(([id]) => reports.some((r) => r.musician_id === id && r.submitted_at))
  const anyAsked = reports.length > 0

  async function sendNow() {
    setSending(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/gig-report`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not send the request')
      const outcomes = (data.outcomes || []) as { name: string; outcome: string }[]
      const sent = outcomes.filter((o) => o.outcome === 'sent').map((o) => o.name)
      const held = outcomes.filter((o) => o.outcome === 'suppressed').map((o) => o.name)
      const noEmail = outcomes.filter((o) => o.outcome === 'no-email').map((o) => o.name)
      if (sent.length) toast.success(`Report request sent to ${sent.join(', ')}`)
      if (held.length) toast.warning(`Not sent (email safe mode): ${held.join(', ')}`)
      if (noEmail.length) toast.error(`No email on file for ${noEmail.join(', ')}`)
      if (!sent.length && !held.length && !noEmail.length) toast.info('Everyone has already sent their report.')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send the request')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
          </svg>
          Gig report
        </h4>
        {leads.length > 0 && !allSubmitted && (
          <Button size="sm" variant="outline" onClick={sendNow} disabled={sending}>
            {sending ? 'Sending…' : anyAsked ? 'Send again' : 'Send request now'}
          </Button>
        )}
      </div>

      {leads.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nobody confirmed on this gig is marked as a leader on the roster, so no one will be asked for a report.
          Turn on &quot;Leader&quot; for a musician in Musicians to get one after the gig.
        </p>
      ) : (
        <ul className="space-y-3">
          {leads.map(([musicianId, musician]) => {
            const report = reports.find((r) => r.musician_id === musicianId)
            return (
              <li key={musicianId} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{name(musician || report?.musician)}</span>
                  <span className="text-xs text-muted-foreground">
                    {report?.submitted_at
                      ? `Report received ${when(report.submitted_at)}`
                      : report?.opened_at
                        ? `Opened ${when(report.opened_at)}, not sent yet`
                        : report
                          ? `Asked ${when(report.requested_at)}`
                          : 'Asked automatically 30 minutes after the gig ends'}
                  </span>
                </div>

                {report?.submitted_at && (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {report.overall && (
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${OVERALL[report.overall].className}`}>
                          {OVERALL[report.overall].label}
                        </span>
                      )}
                      {report.all_on_time !== null && (
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${report.all_on_time ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'}`}>
                          {report.all_on_time ? 'Everyone on time' : 'Someone was late'}
                        </span>
                      )}
                    </div>
                    {[
                      ['Who was late', report.all_on_time ? null : report.late_notes],
                      ['Hiccups', report.hiccups],
                      ['Follow up with the client', report.client_follow_up],
                      ['Arrangements that need work', report.arrangement_notes],
                      ['Anything else', report.other_notes],
                    ].map(([label, value]) =>
                      value ? (
                        <div key={label as string}>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                          <p className="whitespace-pre-wrap">{value}</p>
                        </div>
                      ) : null
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
