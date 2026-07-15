'use client'

/**
 * Add-to-library dialog (Book Builder B4) — upload part PDFs for a work that a
 * client requested but the library doesn't have, straight from an intake row.
 *
 * Flow (all fidelity-preserving, mirroring Phase A):
 *   1. Admin picks PDF files; each gets a part role guessed from its filename
 *      (admin confirms every dropdown — guess only, never decided).
 *   2. Browser sha256-hashes each file (WebCrypto) and asks the server for a
 *      content-addressed upload URL (repertoire/<org>/<sha>.pdf). Already-stored
 *      bytes are skipped automatically.
 *   3. Bytes PUT browser → R2 directly (never through a serverless route).
 *   4. One add-work call verifies every object server-side (size + re-hash),
 *      then creates the repertoire work + parts — or extends an existing work.
 *   5. onCreated(work) lets the intake row link itself to the new work.
 *
 * The work is a permanent library entry: every future questionnaire matches it.
 */

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { guessPartFromFilename, PART_OPTIONS, type PartKey } from '@/lib/intake/part-guess'
import type { EnsembleCanon } from '@/lib/intake/matcher'

export interface CreatedWork {
  id: string
  title: string
  artist: string | null
  ensemble: string
}

const ENSEMBLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'quartet', label: 'Quartet' },
  { value: 'quintet', label: 'Quintet' },
  { value: 'trio', label: 'Trio' },
  { value: 'viola-trio', label: 'Viola Trio' },
  { value: 'duo', label: 'Duo' },
  { value: 'solo', label: 'Solo' },
  { value: 'other', label: 'Other' },
]

type FileStatus = 'ready' | 'hashing' | 'uploading' | 'done' | 'error'

interface FileRow {
  uid: string
  file: File
  part: PartKey
  status: FileStatus
  error: string | null
}

let uidSeq = 0
const nextUid = () => `f-${Date.now()}-${++uidSeq}`

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

interface AddWorkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultTitle: string
  defaultArtist: string
  gigEnsemble?: EnsembleCanon
  onCreated: (work: CreatedWork) => void
}

export function AddWorkDialog({
  open,
  onOpenChange,
  defaultTitle,
  defaultArtist,
  gigEnsemble,
  onCreated,
}: AddWorkDialogProps) {
  const [title, setTitle] = useState(defaultTitle)
  const [artist, setArtist] = useState(defaultArtist)
  const [ensemble, setEnsemble] = useState<string>(gigEnsemble ?? 'quartet')
  const [files, setFiles] = useState<FileRow[]>([])
  const [busy, setBusy] = useState(false)

  function addFiles(list: FileList | null) {
    if (!list) return
    const rows: FileRow[] = []
    for (const file of Array.from(list)) {
      if (!/\.pdf$/i.test(file.name)) {
        toast.error(`"${file.name}" is not a PDF — skipped.`)
        continue
      }
      rows.push({ uid: nextUid(), file, part: guessPartFromFilename(file.name), status: 'ready', error: null })
    }
    setFiles((prev) => [...prev, ...rows])
  }

  function setRow(uid: string, patch: Partial<FileRow>) {
    setFiles((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)))
  }

  function removeRow(uid: string) {
    setFiles((prev) => prev.filter((r) => r.uid !== uid))
  }

  async function submit() {
    if (!title.trim()) {
      toast.error('A title is required.')
      return
    }
    if (files.length === 0) {
      toast.error('Attach at least one part PDF.')
      return
    }
    const dupParts = files.map((f) => f.part).filter((p, i, a) => p !== 'other' && a.indexOf(p) !== i)
    if (dupParts.length > 0) {
      toast.error(`Two files are marked as the same part (${[...new Set(dupParts)].join(', ')}). Fix the dropdowns.`)
      return
    }

    setBusy(true)
    try {
      // 1+2+3. Hash → upload-url → PUT, file by file (statuses shown inline).
      const uploaded: Array<{ part: PartKey; sha256: string; bytes: number; originalFilename: string }> = []
      for (const row of files) {
        setRow(row.uid, { status: 'hashing', error: null })
        const sha256 = await sha256Hex(row.file)

        const urlRes = await fetch('/api/repertoire/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sha256, bytes: row.file.size, filename: row.file.name }),
        })
        const urlData = await urlRes.json()
        if (!urlRes.ok) throw new Error(urlData.error || `Could not start the upload for "${row.file.name}".`)

        if (!urlData.alreadyUploaded) {
          setRow(row.uid, { status: 'uploading' })
          const put = await fetch(urlData.uploadUrl, { method: 'PUT', body: row.file })
          if (!put.ok) throw new Error(`Upload failed for "${row.file.name}" (${put.status}).`)
        }
        setRow(row.uid, { status: 'done' })
        uploaded.push({ part: row.part, sha256, bytes: row.file.size, originalFilename: row.file.name })
      }

      // 4. Create/extend the work — the server re-verifies every object's hash.
      const res = await fetch('/api/repertoire/add-work', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), artist: artist.trim() || null, ensemble, parts: uploaded }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not add the work to the library.')

      const work = data.work as CreatedWork
      if (data.existed) {
        toast.success(
          data.insertedParts.length > 0
            ? `"${work.title}" was already in the library — added ${data.insertedParts.length} new part${data.insertedParts.length === 1 ? '' : 's'}.`
            : `"${work.title}" was already in the library with these parts.`
        )
      } else {
        toast.success(`"${work.title}" added to the library with ${data.insertedParts.length} part${data.insertedParts.length === 1 ? '' : 's'}.`)
      }
      onCreated(work)
      onOpenChange(false)
      setFiles([])
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong.'
      toast.error(msg)
      setFiles((prev) => prev.map((r) => (r.status === 'done' ? r : { ...r, status: 'error', error: msg })))
    } finally {
      setBusy(false)
    }
  }

  const statusLabel: Record<FileStatus, string> = {
    ready: '',
    hashing: 'checking…',
    uploading: 'uploading…',
    done: '✓ uploaded',
    error: 'failed',
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add to library</DialogTitle>
          <DialogDescription>
            Upload the part PDFs for this work. It becomes a permanent library entry — future
            questionnaires will match it automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">Title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-sm" disabled={busy} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">Artist / Composer</label>
              <Input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="(optional)" className="h-8 text-sm" disabled={busy} />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">Arrangement</label>
            <Select value={ensemble} onValueChange={setEnsemble} disabled={busy}>
              <SelectTrigger className="h-8 w-44 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ENSEMBLE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-medium text-muted-foreground block">Part PDFs</label>
            <Input
              type="file"
              accept="application/pdf,.pdf"
              multiple
              disabled={busy}
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
              className="h-9 text-sm"
            />
            {files.length > 0 && (
              <ul className="rounded-md border divide-y">
                {files.map((row) => (
                  <li key={row.uid} className="flex items-center gap-2 px-2.5 py-1.5">
                    <span className="flex-1 min-w-0 truncate text-sm" title={row.file.name}>{row.file.name}</span>
                    <Select value={row.part} onValueChange={(v) => setRow(row.uid, { part: v as PartKey })} disabled={busy}>
                      <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PART_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className={`text-xs w-20 text-right shrink-0 ${row.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {statusLabel[row.status]}
                    </span>
                    <Button type="button" variant="ghost" size="icon-xs" className="text-destructive hover:text-destructive shrink-0" onClick={() => removeRow(row.uid)} disabled={busy} title="Remove file" aria-label="Remove file">
                      <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || files.length === 0 || !title.trim()}>
            {busy ? 'Uploading…' : `Add to library${files.length > 0 ? ` (${files.length} file${files.length === 1 ? '' : 's'})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
