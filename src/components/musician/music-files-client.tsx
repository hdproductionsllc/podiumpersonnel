'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

interface MusicFile {
  id: string
  file_name: string
  file_size: number
  uploaded_at: string
  downloaded: boolean
}

interface MusicProject {
  projectId: string
  projectName: string
  startDate: string | null
  endDate: string | null
  organizationName: string
  musicianId: string
  files: MusicFile[]
  confirmation: {
    token: string
    confirmed_at: string | null
  } | null
}

interface MusicFilesClientProps {
  impersonateId?: string
  projectFilter?: string
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDateRange(start: string | null, end: string | null): string {
  const parseDate = (d: string) => new Date(d + 'T12:00:00')
  if (!start && !end) return ''
  if (start && !end) return parseDate(start).toLocaleDateString()
  if (!start && end) return parseDate(end).toLocaleDateString()
  if (start === end) return parseDate(start!).toLocaleDateString()
  return `${parseDate(start!).toLocaleDateString()} – ${parseDate(end!).toLocaleDateString()}`
}

export function MusicFilesClient({ impersonateId, projectFilter }: MusicFilesClientProps) {
  const [projects, setProjects] = useState<MusicProject[]>([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchFiles()
  }, [])

  useEffect(() => {
    // Auto-scroll to filtered project
    if (projectFilter && !loading && projects.length > 0) {
      const el = document.getElementById(`music-project-${projectFilter}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }, [projectFilter, loading, projects])

  async function fetchFiles() {
    try {
      const params = new URLSearchParams()
      if (impersonateId) params.set('impersonate', impersonateId)
      const res = await fetch(`/api/musician/files?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setProjects(data.projects || [])
      }
    } catch {
      // Fail silently
    } finally {
      setLoading(false)
    }
  }

  async function handleDownload(projectId: string, fileId: string) {
    setDownloading(fileId)
    try {
      const params = new URLSearchParams()
      if (impersonateId) params.set('impersonate', impersonateId)
      const res = await fetch(`/api/musician/files/${fileId}/download?${params.toString()}`, {
        method: 'POST',
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Download failed')
      }

      // Open signed URL in new tab
      window.open(data.url, '_blank')

      // Mark as downloaded in local state
      setProjects((prev) =>
        prev.map((p) => {
          if (p.projectId !== projectId) return p
          return {
            ...p,
            files: p.files.map((f) =>
              f.id === fileId ? { ...f, downloaded: true } : f
            ),
          }
        })
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setDownloading(null)
    }
  }

  async function handleConfirm(projectId: string, token: string) {
    setConfirming(projectId)
    try {
      const res = await fetch('/api/musician/music-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Confirmation failed')
      }

      toast.success('Music receipt confirmed!')

      // Update local state
      setProjects((prev) =>
        prev.map((p) => {
          if (p.projectId !== projectId) return p
          return {
            ...p,
            confirmation: p.confirmation
              ? { ...p.confirmation, confirmed_at: new Date().toISOString() }
              : p.confirmation,
          }
        })
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Confirmation failed')
    } finally {
      setConfirming(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Music</h1>
          <p className="text-muted-foreground mt-1">Loading your files...</p>
        </div>
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Music</h1>
          <p className="text-muted-foreground mt-1">Download sheet music and parts for your projects.</p>
        </div>
        <div className="rounded-lg border p-8 text-center">
          <svg className="mx-auto h-12 w-12 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
          </svg>
          <h3 className="mt-4 text-sm font-medium">No music shared yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            When your conductor or manager uploads sheet music, it will appear here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6" ref={scrollRef}>
      <div>
        <h1 className="text-2xl font-bold">Music</h1>
        <p className="text-muted-foreground mt-1">Download sheet music and parts for your projects.</p>
      </div>

      <div className="space-y-4">
        {projects.map((project) => {
          const allDownloaded = project.files.every((f) => f.downloaded)
          const isConfirmed = project.confirmation?.confirmed_at != null
          const canConfirm = allDownloaded && project.confirmation && !isConfirmed

          return (
            <div
              key={project.projectId}
              id={`music-project-${project.projectId}`}
              className={`rounded-lg border p-5 space-y-4 ${
                projectFilter === project.projectId
                  ? 'ring-2 ring-primary'
                  : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{project.projectName}</h2>
                  {(project.startDate || project.endDate) && (
                    <p className="text-sm text-muted-foreground">
                      {formatDateRange(project.startDate, project.endDate)}
                    </p>
                  )}
                </div>
                {isConfirmed && (
                  <Badge variant="success">Confirmed</Badge>
                )}
              </div>

              <div className="space-y-2">
                {project.files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {file.downloaded ? (
                        <svg className="h-5 w-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                        </svg>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{file.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.file_size)}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={file.downloaded ? 'outline' : 'default'}
                      onClick={() => handleDownload(project.projectId, file.id)}
                      disabled={downloading === file.id}
                    >
                      {downloading === file.id ? (
                        'Opening...'
                      ) : file.downloaded ? (
                        'Download Again'
                      ) : (
                        <>
                          <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                          </svg>
                          Download
                        </>
                      )}
                    </Button>
                  </div>
                ))}
              </div>

              {/* Confirm button */}
              {project.confirmation && !isConfirmed && (
                <div className="pt-2">
                  <Button
                    onClick={() => handleConfirm(project.projectId, project.confirmation!.token)}
                    disabled={!canConfirm || confirming === project.projectId}
                    className="w-full"
                    variant={canConfirm ? 'default' : 'outline'}
                  >
                    {confirming === project.projectId
                      ? 'Confirming...'
                      : canConfirm
                        ? 'I Have Received All Music'
                        : `Download all files first (${project.files.filter((f) => f.downloaded).length}/${project.files.length})`}
                  </Button>
                </div>
              )}

              {isConfirmed && (
                <p className="text-xs text-muted-foreground text-center">
                  Confirmed on{' '}
                  {new Date(project.confirmation!.confirmed_at!).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
