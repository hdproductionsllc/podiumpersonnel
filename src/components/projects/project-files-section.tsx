'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useTerms } from '@/components/providers/vertical-provider'
import { term } from '@/lib/verticals'
import { SendMusicDialog } from './send-music-dialog'

interface ProjectFileInstrument {
  instrument_id: string
  instrument: { id: string; name: string }
}

export interface ProjectFile {
  id: string
  file_name: string
  file_size: number
  scope: string
  uploaded_at: string
  notes: string | null
  project_file_instruments: ProjectFileInstrument[]
}

interface MusicSend {
  id: string
  sent_at: string
  musician_count: number
  music_confirmations: {
    id: string
    musician_id: string
    confirmed_at: string | null
  }[]
}

interface ProjectFilesSectionProps {
  projectId: string
  projectName: string
  organizationId: string
  organizationName: string
  positions: {
    id: string
    status: string
    instrument_id: string
    musician_id: string | null
    instrument?: { id: string; name: string } | null
    musician?: { id: string; first_name: string; last_name: string } | null
  }[]
  canManage: boolean
  timezone: string
  musicSends?: MusicSend[]
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ProjectFilesSection({
  projectId,
  projectName,
  organizationId,
  organizationName,
  positions,
  canManage,
  timezone,
  musicSends,
}: ProjectFilesSectionProps) {
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [sendMusicOpen, setSendMusicOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [scope, setScope] = useState<'all' | 'assigned'>('all')
  const [selectedInstruments, setSelectedInstruments] = useState<string[]>([])
  const [uploadNotes, setUploadNotes] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [initialized, setInitialized] = useState(false)
  const terms = useTerms()

  // Get unique instruments from project positions
  const projectInstruments = Array.from(
    new Map(
      positions
        .filter((p) => p.instrument)
        .map((p) => [p.instrument!.id, p.instrument!])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name))

  // Fetch files on first render
  if (!initialized) {
    setInitialized(true)
    fetchFiles()
  }

  async function fetchFiles() {
    try {
      const res = await fetch(`/api/projects/${projectId}/files`)
      if (res.ok) {
        const data = await res.json()
        setFiles(data.files || [])
      }
    } catch (err) {
      // The section just stays empty; the admin can reopen to retry
      console.warn('project-files-section: could not load files:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleUpload() {
    if (!selectedFile) return

    setUploading(true)
    try {
      // 1. Ask the server for a short-lived signed upload URL. The file bytes go
      //    straight to Supabase Storage — never through the API route — so we're
      //    not capped by Vercel's ~4.5MB serverless request-body limit.
      const urlRes = await fetch(`/api/projects/${projectId}/files/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          mimeType: selectedFile.type,
        }),
      })
      const urlData = await urlRes.json()
      if (!urlRes.ok) {
        throw new Error(urlData.error || 'Upload failed')
      }

      // 2. Upload the PDF directly to storage using the signed token.
      const supabase = createClient()
      const { error: uploadError } = await supabase.storage
        .from('project-files')
        .uploadToSignedUrl(urlData.path, urlData.token, selectedFile, {
          contentType: 'application/pdf',
        })
      if (uploadError) {
        throw new Error('Failed to upload file. Please try again.')
      }

      // 3. Record the file metadata (small JSON — well within limits).
      const res = await fetch(`/api/projects/${projectId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath: urlData.path,
          fileName: selectedFile.name,
          scope,
          instrumentIds:
            scope === 'assigned' && selectedInstruments.length > 0
              ? selectedInstruments
              : null,
          notes: uploadNotes.trim() || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      toast.success(`Uploaded ${selectedFile.name}`)
      setUploadOpen(false)
      resetUploadForm()
      fetchFiles()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleDownload(fileId: string) {
    setDownloading(fileId)
    try {
      const res = await fetch(`/api/projects/${projectId}/files/${fileId}/download`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Download failed')
      }

      const { url } = await res.json()
      window.open(url, '_blank')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setDownloading(null)
    }
  }

  async function handleDelete(fileId: string, fileName: string) {
    setDeleting(fileId)
    try {
      const res = await fetch(`/api/projects/${projectId}/files/${fileId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Delete failed')
      }

      toast.success(`Deleted ${fileName}`)
      setFiles((prev) => prev.filter((f) => f.id !== fileId))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  function resetUploadForm() {
    setSelectedFile(null)
    setScope('all')
    setSelectedInstruments([])
    setUploadNotes('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files are allowed')
      e.target.value = ''
      return
    }

    if (file.size > 40 * 1024 * 1024) {
      toast.error('File must be under 40MB')
      e.target.value = ''
      return
    }

    setSelectedFile(file)
  }

  function toggleInstrument(id: string) {
    setSelectedInstruments((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Music / Parts</h4>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
          </svg>
          Music / Parts
        </h4>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setUploadOpen(true)}
            >
              Upload File
            </Button>
            {files.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSendMusicOpen(true)}
              >
                <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                </svg>
                Send Music
              </Button>
            )}
          </div>
        )}
      </div>

      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No files uploaded yet. Upload PDFs of sheet music and parts to distribute to your {term(terms, 'person', { plural: true, case: 'lower' })}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-xs">File</th>
                <th className="px-3 py-2 text-left font-medium text-xs">Size</th>
                <th className="px-3 py-2 text-left font-medium text-xs">Assigned To</th>
                <th className="px-3 py-2 text-left font-medium text-xs">Uploaded</th>
                {canManage && (
                  <th className="px-3 py-2 text-right font-medium text-xs"></th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {files.map((file) => (
                <tr key={file.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">
                    <button
                      className="flex items-center gap-2 hover:underline text-left"
                      onClick={() => handleDownload(file.id)}
                      disabled={downloading === file.id}
                    >
                      <svg className="h-4 w-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                      </svg>
                      <span className="truncate max-w-[200px]">{file.file_name}</span>
                    </button>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatFileSize(file.file_size)}
                  </td>
                  <td className="px-3 py-2">
                    {file.scope === 'all' ? (
                      <Badge variant="secondary">All {term(terms, 'person', { plural: true })}</Badge>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {file.project_file_instruments.map((fi) => (
                          <Badge key={fi.instrument_id} variant="outline" className="text-xs">
                            {fi.instrument.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(file.uploaded_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      timeZone: timezone,
                    })}
                  </td>
                  {canManage && (
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => handleDownload(file.id)}
                          disabled={downloading === file.id}
                          title="Download"
                        >
                          {downloading === file.id ? (
                            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                            </svg>
                          ) : (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive h-7 w-7 p-0"
                          onClick={() => handleDelete(file.id, file.file_name)}
                          disabled={deleting === file.id}
                          title="Delete"
                        >
                          {deleting === file.id ? (
                            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                            </svg>
                          ) : (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                          )}
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Music Confirmation Status */}
      {(() => {
        if (!musicSends || musicSends.length === 0) return null
        const latestSend = [...musicSends].sort((a, b) =>
          new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
        )[0]
        const confirmations = latestSend.music_confirmations || []
        const totalCount = confirmations.length
        if (totalCount === 0) return null
        const confirmedCount = confirmations.filter((c) => c.confirmed_at).length
        const allConfirmed = confirmedCount === totalCount
        return (
          <div
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer hover:opacity-80 ${
              allConfirmed
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
            }`}
            onClick={() => setSendMusicOpen(true)}
          >
            {allConfirmed ? (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                All {totalCount} confirmed music receipt
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                Music: {confirmedCount} of {totalCount} confirmed
              </>
            )}
          </div>
        )
      })()}

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={(open) => {
        setUploadOpen(open)
        if (!open) resetUploadForm()
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Music File</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">File (PDF only, max 40MB)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={handleFileChange}
                className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
              />
              {selectedFile && (
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedFile.name} ({formatFileSize(selectedFile.size)})
                </p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Assign to</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="scope"
                    value="all"
                    checked={scope === 'all'}
                    onChange={() => setScope('all')}
                    className="accent-primary"
                  />
                  <span className="text-sm">All {term(terms, 'person', { plural: true })}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="scope"
                    value="assigned"
                    checked={scope === 'assigned'}
                    onChange={() => setScope('assigned')}
                    className="accent-primary"
                  />
                  <span className="text-sm">Specific Parts</span>
                </label>
              </div>

              {scope === 'assigned' && (
                <div className="mt-3 space-y-1 pl-6">
                  {projectInstruments.map((inst) => (
                    <label key={inst.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedInstruments.includes(inst.id)}
                        onChange={() => toggleInstrument(inst.id)}
                        className="accent-primary"
                      />
                      <span className="text-sm">{inst.name}</span>
                    </label>
                  ))}
                  {projectInstruments.length === 0 && (
                    <p className="text-xs text-muted-foreground">No {term(terms, 'skill', { plural: true, case: 'lower' })} assigned to this {term(terms, 'work', { case: 'lower' })} yet.</p>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <input
                type="text"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="e.g., 'Practice at home' or 'Bring to rehearsal'"
                value={uploadNotes}
                onChange={(e) => setUploadNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setUploadOpen(false)
              resetUploadForm()
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || uploading || (scope === 'assigned' && selectedInstruments.length === 0)}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Music Dialog */}
      <SendMusicDialog
        open={sendMusicOpen}
        onOpenChange={setSendMusicOpen}
        projectId={projectId}
        projectName={projectName}
        organizationName={organizationName}
        files={files}
        positions={positions}
        timezone={timezone}
      />
    </div>
  )
}
