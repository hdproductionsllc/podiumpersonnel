'use client'

/**
 * The operator's controls for the client song planner (082), inside the Client
 * Selections panel.
 *
 * Deliberately small. The operator's job here is four buttons — send it, copy
 * it, chase it, reopen it — and everything else about the client's list shows up
 * in the review screen below, which is unchanged.
 *
 * Every action re-reads its result from the server response rather than guessing
 * locally: a "resend" mints a NEW token and kills the old link, so a stale URL
 * left on screen would be a link that silently 404s for the client.
 */

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { plannerState, type IntakePlannerFields } from '@/lib/intake/types'

interface ClientPlannerCardProps {
  projectId: string
  /** The planner columns from the loaded intake, or null when none exists yet. */
  planner: Partial<IntakePlannerFields> | null
  /** Whether the project has a client email — drives "send" vs "copy only". */
  hasClientEmail: boolean
  /** SONG_PLANNER_EMAILS, from the server. Off means this feature sends nothing
   *  — no invite, no reminders — and the operator sends the link themselves. */
  emailsEnabled: boolean
  /** Re-load the intake after an action that changes the songs' editability. */
  onChanged?: () => void
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function ClientPlannerCard({
  projectId,
  planner,
  hasClientEmail,
  emailsEnabled,
  onChanged,
}: ClientPlannerCardProps) {
  const [fields, setFields] = useState<Partial<IntakePlannerFields>>(planner ?? {})
  const [token, setToken] = useState<string | null>(planner?.client_token ?? null)
  const [busy, setBusy] = useState<null | 'create' | 'send' | 'revoke' | 'reopen'>(null)

  // Built in the browser only — this component server-renders inside the
  // dashboard, where `window` does not exist.
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  const url = token && origin ? `${origin}/plan/${token}` : null

  const state = plannerState({ ...fields, client_token: token })
  const dueOn = formatDate(fields.client_due_at)

  async function act(
    kind: 'create' | 'send' | 'revoke' | 'reopen',
    request: () => Promise<Response>
  ) {
    setBusy(kind)
    try {
      const res = await request()
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || 'That did not work. Please try again.')
        return
      }

      if (kind === 'create' || kind === 'send') {
        // Take the token from the URL the server just minted — never keep the
        // previous one, which this call has already invalidated.
        setToken(typeof data.url === 'string' ? data.url.split('/plan/')[1] ?? null : null)
        setFields((f) => ({
          ...f,
          client_token_expires_at: data.expiresAt ?? null,
          client_due_at: data.dueAt ?? null,
          client_opened_at: null,
          client_submitted_at: null,
        }))
        if (data.sendingDisabled) {
          // SONG_PLANNER_EMAILS is off. The link is real — only the send was
          // withheld — so say exactly that rather than implying it went out.
          toast.success('Link ready. Emailing is switched off, so copy it and send it yourself.')
        } else if (data.sendError) {
          toast.error('The link is ready, but the email would not send — copy it and send it yourself.')
        } else if (data.sent) {
          toast.success('Sent to the client.')
        } else {
          toast.success('Link ready — copy it and send it however you like.')
        }
      }

      if (kind === 'revoke') {
        setToken(null)
        setFields((f) => ({ ...f, client_token_expires_at: null }))
        toast.success('Link revoked. Their songs are still here.')
      }

      if (kind === 'reopen') {
        setFields((f) => ({ ...f, client_submitted_at: null }))
        toast.success('Reopened — the same link is editable again.')
        onChanged?.()
      }
    } catch {
      toast.error('That did not work. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  const post = (send: boolean) => () =>
    fetch(`/api/intake/${projectId}/planner-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ send }),
    })

  function copy() {
    if (!url) return
    void navigator.clipboard.writeText(url).then(
      () => toast.success('Link copied.'),
      () => toast.error('Could not copy — select the link and copy it by hand.')
    )
  }

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold">Let the client choose</p>
        {state === 'not-sent' && <Badge variant="secondary" className="text-xs">No link yet</Badge>}
        {state === 'sent' && <Badge variant="secondary" className="text-xs">Sent · not opened</Badge>}
        {state === 'in-progress' && <Badge variant="warning" className="text-xs">In progress</Badge>}
        {state === 'submitted' && <Badge variant="success" className="text-xs">Submitted · locked</Badge>}
        {state === 'expired' && <Badge variant="warning" className="text-xs">Link expired</Badge>}
      </div>

      {state === 'not-sent' && (
        <p className="text-xs text-muted-foreground">
          Send the couple a link and they build the list themselves — it lands here already
          matched against your library, with nothing to transcribe.
        </p>
      )}

      {state === 'submitted' && (
        <p className="text-xs text-muted-foreground">
          They sent their list in
          {formatDate(fields.client_submitted_at) ? ` on ${formatDate(fields.client_submitted_at)}` : ''}.
          It&apos;s locked to them — reopen it if they ask for a change.
        </p>
      )}

      {dueOn && state !== 'submitted' && (
        <p className="text-xs text-muted-foreground">
          Due {dueOn}
          {emailsEnabled ? ' · reminders go out automatically.' : '.'}
        </p>
      )}

      {!emailsEnabled && (
        <p className="text-xs text-muted-foreground">
          Emailing is switched off for the planner, so nothing is sent automatically —
          no invite and no reminders. Copy the link below and send it yourself.
        </p>
      )}

      {url && (
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{url}</code>
          <Button size="sm" variant="outline" onClick={copy}>Copy</Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {hasClientEmail && emailsEnabled && (
          <Button size="sm" onClick={() => act('send', post(true))} disabled={busy !== null}>
            {busy === 'send' ? 'Sending…' : state === 'not-sent' ? 'Email the client' : 'Send a fresh link'}
          </Button>
        )}
        {!url && (
          <Button
            size="sm"
            variant={hasClientEmail ? 'outline' : 'default'}
            onClick={() => act('create', post(false))}
            disabled={busy !== null}
          >
            {busy === 'create' ? 'Creating…' : 'Just create a link'}
          </Button>
        )}
        {state === 'submitted' && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              act('reopen', () =>
                fetch(`/api/intake/${projectId}/planner-link`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ reopen: true }),
                })
              )
            }
            disabled={busy !== null}
          >
            {busy === 'reopen' ? 'Reopening…' : 'Reopen for editing'}
          </Button>
        )}
        {url && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              act('revoke', () => fetch(`/api/intake/${projectId}/planner-link`, { method: 'DELETE' }))
            }
            disabled={busy !== null}
          >
            {busy === 'revoke' ? 'Revoking…' : 'Revoke link'}
          </Button>
        )}
      </div>

      {!hasClientEmail && emailsEnabled && (
        <p className="text-xs text-muted-foreground">
          No client email on this project — add one under Client &amp; Booking to send it from here.
        </p>
      )}
    </div>
  )
}
