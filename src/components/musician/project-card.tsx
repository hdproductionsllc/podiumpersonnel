'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  ChevronDown,
  Download,
  CheckCircle2,
  FileText,
  MapPin,
  Music2,
} from 'lucide-react'
import { cn, DEFAULT_TIMEZONE } from '@/lib/utils'
import { toast } from 'sonner'

export interface ProjectService {
  id: string
  name: string
  service_type: string
  start_time: string
  end_time: string | null
  venue: string | null
  venue_info?: {
    name: string
    address: string | null
    city: string | null
    state: string | null
    google_maps_url: string | null
  } | null
}

export interface ProjectFile {
  id: string
  file_name: string
  file_size: number
  downloaded: boolean
}

export interface ProjectConfirmation {
  token: string
  confirmed_at: string | null
}

export interface ProjectCardData {
  projectId: string
  projectName: string
  organizationName: string
  organizationTimezone: string | null
  instrumentName: string
  chairNumber: number
  totalChairs: number
  startDate: string | null
  endDate: string | null
  services: ProjectService[]
  files: ProjectFile[]
  confirmation: ProjectConfirmation | null
}

interface ProjectCardProps {
  project: ProjectCardData
  impersonateId?: string | null
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ProjectCard({ project, impersonateId }: ProjectCardProps) {
  const [musicOpen, setMusicOpen] = useState(false)
  const [files, setFiles] = useState(project.files)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmation, setConfirmation] = useState(project.confirmation)

  const timezone = project.organizationTimezone || DEFAULT_TIMEZONE
  const showChair = project.totalChairs > 1
  const fileCount = files.length
  const downloadedCount = files.filter((f) => f.downloaded).length
  const allDownloaded = fileCount > 0 && downloadedCount === fileCount
  const isConfirmed = confirmation?.confirmed_at != null
  const canConfirm = allDownloaded && confirmation && !isConfirmed

  const dateRange = (() => {
    if (!project.startDate) return null
    const parseDate = (d: string) => new Date(d + 'T12:00:00')
    const start = parseDate(project.startDate)
    if (!project.endDate || project.startDate === project.endDate) {
      return format(start, 'MMM d, yyyy')
    }
    const end = parseDate(project.endDate)
    if (start.getFullYear() === end.getFullYear()) {
      return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`
    }
    return `${format(start, 'MMM d, yyyy')} - ${format(end, 'MMM d, yyyy')}`
  })()

  async function handleDownload(fileId: string) {
    setDownloading(fileId)
    try {
      const params = new URLSearchParams()
      if (impersonateId) params.set('impersonate', impersonateId)
      const res = await fetch(`/api/musician/files/${fileId}/download?${params.toString()}`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Download failed')

      window.open(data.url, '_blank')
      setFiles((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, downloaded: true } : f))
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setDownloading(null)
    }
  }

  async function handleConfirm() {
    if (!confirmation?.token) return
    setConfirming(true)
    try {
      const res = await fetch('/api/musician/music-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: confirmation.token }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Confirmation failed')

      toast.success('Music receipt confirmed!')
      setConfirmation({ ...confirmation, confirmed_at: new Date().toISOString() })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Confirmation failed')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-base leading-tight">{project.projectName}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {project.organizationName}
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0 flex items-center gap-1">
            <Music2 className="h-3 w-3" />
            {project.instrumentName}
            {showChair && ` ${project.chairNumber}`}
          </Badge>
        </div>
        {dateRange && (
          <p className="text-xs text-muted-foreground mt-1">{dateRange}</p>
        )}
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {/* Services */}
        {project.services.length > 0 && (
          <div className="space-y-1.5">
            {project.services.map((service) => {
              const start = toZonedTime(new Date(service.start_time), timezone)
              const venueName = service.venue_info?.name || service.venue
              const mapsUrl = service.venue_info?.google_maps_url

              return (
                <div
                  key={service.id}
                  className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-md hover:bg-muted/50"
                >
                  <span className="font-medium text-xs text-muted-foreground w-20 shrink-0">
                    {format(start, 'EEE MMM d')}
                  </span>
                  <span className="text-xs text-muted-foreground w-16 shrink-0">
                    {format(start, 'h:mm a')}
                  </span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                    {service.service_type}
                  </Badge>
                  {venueName && (
                    <span className="text-xs text-muted-foreground truncate ml-auto">
                      {mapsUrl ? (
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MapPin className="h-3 w-3" />
                          {venueName}
                        </a>
                      ) : (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {venueName}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Music Files */}
        {fileCount > 0 && (
          <Collapsible open={musicOpen} onOpenChange={setMusicOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full py-2 px-2 rounded-md hover:bg-muted/50 text-sm">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  Music ({fileCount} {fileCount === 1 ? 'file' : 'files'})
                </span>
                {isConfirmed && (
                  <Badge variant="success" className="text-[10px]">Confirmed</Badge>
                )}
                {!isConfirmed && downloadedCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {downloadedCount}/{fileCount} downloaded
                  </span>
                )}
              </div>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform',
                  musicOpen && 'rotate-180'
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-2 pt-2 pl-2">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/30"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {file.downloaded ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      ) : (
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm truncate">{file.file_name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatFileSize(file.file_size)}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={file.downloaded ? 'ghost' : 'default'}
                      className="shrink-0 h-7 text-xs"
                      onClick={() => handleDownload(file.id)}
                      disabled={downloading === file.id}
                    >
                      {downloading === file.id ? (
                        'Opening...'
                      ) : file.downloaded ? (
                        <>
                          <Download className="h-3 w-3 mr-1" />
                          Again
                        </>
                      ) : (
                        <>
                          <Download className="h-3 w-3 mr-1" />
                          Download
                        </>
                      )}
                    </Button>
                  </div>
                ))}

                {/* Confirm button */}
                {confirmation && !isConfirmed && (
                  <Button
                    onClick={handleConfirm}
                    disabled={!canConfirm || confirming}
                    className="w-full mt-2"
                    size="sm"
                    variant={canConfirm ? 'default' : 'outline'}
                  >
                    {confirming
                      ? 'Confirming...'
                      : canConfirm
                        ? 'Confirm Music Received'
                        : `Download all files first (${downloadedCount}/${fileCount})`}
                  </Button>
                )}

                {isConfirmed && (
                  <p className="text-xs text-muted-foreground text-center pt-1">
                    Confirmed on{' '}
                    {new Date(confirmation!.confirmed_at!).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  )
}
