'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { MAX_IMAGE_BYTES, MAX_TOTAL_BYTES, type FollowupInput } from '@/lib/gig-followups/validation'

type Recipient = { id: string; name: string; email: string | null }
type History = { id: string; mode: string; subject: string; message: string; status: string; created_at: string; attachment_names: string[]; gig_followup_recipients: { musician_id: string; recipient_name: string; status: string }[] }
const labels: Record<string, string> = { pending: 'Not started', sending: 'Sending — delivery not yet verified', sent: 'Sent to email provider', suppressed: 'Not sent (test safety mode)', uncertain: 'Delivery uncertain — check before resending' }

export function GigFollowupComposer({ projectId, onClose, onSent }: { projectId: string; onClose: () => void; onSent: () => void }) {
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [history, setHistory] = useState<History[]>([])
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<FollowupInput['mode']>('followup')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [reviewing, setReviewing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef<string | null>(null)
  const inFlight = useRef(false)
  const endpoint = `/api/projects/${projectId}/followups`

  async function refresh() {
    const response = await fetch(endpoint, { cache: 'no-store' })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Could not load recipients and delivery status')
    setRecipients(data.recipients); setHistory(data.history); setReady(true)
  }
  useEffect(() => {
    let active = true
    fetch(endpoint, { cache: 'no-store' }).then(async response => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not load follow-ups')
      if (active) { setRecipients(data.recipients); setHistory(data.history); setReady(true) }
    }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [endpoint])

  function chooseFiles(selected: File[]) {
    if (selected.length > 3 || selected.some(f => f.size > MAX_IMAGE_BYTES || !['image/png','image/jpeg','image/webp'].includes(f.type)) || selected.reduce((n,f) => n+f.size,0) > MAX_TOTAL_BYTES) {
      setError('Choose up to 3 PNG, JPEG or WebP images, 750 KB each and 1.5 MB total.'); setFiles([]); return
    }
    setError(''); setFiles(selected)
  }
  async function send() {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setSubmitted(true); setError('')
    requestId.current ||= crypto.randomUUID()
    try {
      const attachments = await Promise.all(files.map(async file => ({ filename: file.name, contentType: file.type, content: await new Promise<string>((resolve,reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file)
      }) })))
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: requestId.current, mode, subject, message, recipientIds: recipients.map(r => r.id), attachments }) })
      const data = await response.json()
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          // Validation/authorization/transaction rejection: no send was accepted.
          setSubmitted(false); setReviewing(false); requestId.current = null
        }
        throw new Error(data.error || 'Check delivery status before trying again')
      }
      await refresh(); onSent()
    } catch (e) {
      setError(`${e instanceof Error ? e.message : 'The request could not be completed'}. Check delivery status below before starting another message.`)
      await refresh().catch(() => {})
    } finally { inFlight.current = false; setBusy(false) }
  }
  const missing = recipients.filter(r => !r.email?.trim())
  const blocked = history.some(h => h.status !== 'complete')
  return <div className="space-y-4">
    <h3 className="font-semibold">Send a gig follow-up</h3>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!submitted && <>
      <label className="block text-sm">Message type
        <select className="mt-1 w-full border rounded-md p-2" value={mode} disabled={reviewing} onChange={e => setMode(e.target.value as FollowupInput['mode'])}>
          <option value="followup">Ordinary follow-up — keep confirmations</option>
          <option value="material_update">Material details changed — request fresh confirmations</option>
        </select>
      </label>
      <p className="text-sm text-muted-foreground">{mode === 'followup' ? 'Send extra information or a venue map. Existing confirmations stay as they are.' : 'Describe every change below. Update the project schedule or venue first if needed. This creates a new confirmation round for all confirmed musicians; previous confirmations stay in the history.'}</p>
      <label className="block text-sm">Subject<input maxLength={120} value={subject} disabled={reviewing} onChange={e => setSubject(e.target.value)} className="mt-1 w-full border rounded-md p-2" /></label>
      <label className="block text-sm">Message<textarea maxLength={10000} rows={6} value={message} disabled={reviewing} onChange={e => setMessage(e.target.value)} className="mt-1 w-full border rounded-md p-2" /></label>
      <label className="block text-sm">Venue maps or pictures<input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={reviewing} onChange={e => chooseFiles(Array.from(e.target.files || []))} className="mt-1 block w-full" /></label>
      <p className="text-xs text-muted-foreground">Up to 3 static images, 750 KB each and 1.5 MB total. Pictures are sent as email attachments. PNG copies are created with metadata removed.</p>
      {files.length > 0 && <ul className="text-sm">{files.map((f,i) => <li key={i}>{f.name} ({Math.ceil(f.size/1024)} KB)</li>)}</ul>}
      <div className="rounded-md border p-3 text-sm"><p className="font-medium">Recipients ({recipients.length})</p>{recipients.map(r => <p key={r.id}>{r.name} — {r.email || 'No email on file'}</p>)}</div>
      {missing.length > 0 && <p className="text-sm text-destructive">Add the missing email addresses before sending.</p>}
      {blocked && <p className="text-sm text-destructive">A previous message is still processing. Check its status before sending another.</p>}
      <div className="flex gap-2">
        <Button variant="outline" onClick={reviewing ? () => setReviewing(false) : onClose}>{reviewing ? 'Back to edit' : 'Back'}</Button>
        {reviewing ? <Button disabled={busy} onClick={send}>{busy ? 'Sending…' : `Send to ${recipients.length} musicians`}</Button> : <Button disabled={!ready || !subject.trim() || !message.trim() || !recipients.length || missing.length > 0 || blocked} onClick={() => { setError(''); setReviewing(true) }}>Review message</Button>}
      </div>
      {reviewing && <p role="status" className="text-sm font-medium">Review the message, attachments and recipients above. {mode === 'material_update' ? 'Everyone will need to confirm this update.' : 'Existing confirmations will be preserved.'}</p>}
    </>}
    {submitted && <p role="status" className="text-sm">{busy ? 'Sending. Keep this dialog open.' : 'The request has been processed or needs checking. Per-recipient results are below; do not resend an uncertain delivery.'}</p>}
    <div className="border-t pt-3 space-y-3">
      <div className="flex justify-between"><h4 className="font-medium">Recent follow-ups</h4><Button size="sm" variant="outline" disabled={busy} onClick={() => refresh().catch(e => setError(e.message))}>Refresh status</Button></div>
      {history.map(h => <div className="rounded-md border p-3 text-sm space-y-2" key={h.id}>
        <p className="font-medium">{h.subject} — {h.mode === 'material_update' ? 'Fresh confirmation requested' : 'Ordinary follow-up'}</p>
        <p className="whitespace-pre-wrap">{h.message}</p>
        {h.attachment_names.map((name,index) => <a className="block underline" key={index} href={`${endpoint}/${h.id}/attachments/${index}`}>{name}</a>)}
        {h.gig_followup_recipients.map(r => <p key={r.musician_id}>{r.recipient_name}: {labels[r.status] || r.status}</p>)}
      </div>)}
      {submitted && <Button disabled={busy} variant="outline" onClick={onClose}>Back to gig status</Button>}
    </div>
  </div>
}
