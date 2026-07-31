'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface LibraryPart {
  id: string
  part: string
  substitute: boolean
  played_on: string | null
  original_filename: string
  bytes: number | null
  available: boolean
}

interface LibraryWork {
  id: string
  title: string
  artist: string | null
  ensemble: string
  tags: string[]
  parts: LibraryPart[]
}

const ENSEMBLES = [
  { value: '', label: 'Any ensemble' },
  { value: 'quartet', label: 'Quartet' },
  { value: 'quintet', label: 'Quintet' },
  { value: 'trio', label: 'Trio' },
  { value: 'viola-trio', label: 'Viola trio' },
  { value: 'duo', label: 'Duo' },
  { value: 'solo', label: 'Solo' },
  { value: 'other', label: 'Other' },
]

const PARTS = [
  { value: '', label: 'Any part' },
  { value: 'vln1', label: 'Violin 1' },
  { value: 'vln2', label: 'Violin 2' },
  { value: 'vla', label: 'Viola' },
  { value: 'vc', label: 'Cello' },
  { value: 'bass', label: 'Bass' },
  { value: 'voice', label: 'Voice' },
  { value: 'organ', label: 'Organ' },
  { value: 'score', label: 'Score' },
  { value: 'other', label: 'Other' },
]

const PART_LABELS: Record<string, string> = Object.fromEntries(
  PARTS.filter((p) => p.value).map((p) => [p.value, p.label])
)

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function LibraryClient({ totalWorks }: { totalWorks: number }) {
  const [query, setQuery] = useState('')
  const [ensemble, setEnsemble] = useState('')
  const [part, setPart] = useState('')
  const [page, setPage] = useState(0)

  const [works, setWorks] = useState<LibraryWork[]>([])
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [partFiltered, setPartFiltered] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Guards against an earlier, slower request overwriting a newer one — the
  // classic search race where you type fast and land on stale results.
  const requestId = useRef(0)

  const load = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set('q', query.trim())
      if (ensemble) params.set('ensemble', ensemble)
      if (part) params.set('part', part)
      params.set('page', String(page))

      const res = await fetch(`/api/library/search?${params.toString()}`)
      const data = await res.json().catch(() => ({}))
      if (id !== requestId.current) return

      if (!res.ok) throw new Error(data.error || 'Could not load the library.')

      setWorks(data.works ?? [])
      setTotal(data.total ?? 0)
      setPageSize(data.pageSize ?? 50)
      setPartFiltered(!!data.partFiltered)
    } catch (err) {
      if (id !== requestId.current) return
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setWorks([])
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [query, ensemble, part, page])

  // Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  // Any filter change starts from the first page; staying on page 7 of a new
  // search shows nothing and reads as "no results".
  useEffect(() => {
    setPage(0)
  }, [query, ensemble, part])

  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Music Library</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {totalWorks.toLocaleString()} works on the shelf. Search, then open or download any part.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title or artist…"
          className="sm:max-w-sm"
          aria-label="Search the music library"
        />
        <select
          value={ensemble}
          onChange={(e) => setEnsemble(e.target.value)}
          aria-label="Filter by ensemble"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {ENSEMBLES.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={part}
          onChange={(e) => setPart(e.target.value)}
          aria-label="Filter by part"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {PARTS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {loading && works.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : works.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {query || ensemble || part
              ? 'Nothing matches those filters.'
              : 'The library is empty.'}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {partFiltered
              ? `Showing works on this page that have a ${PART_LABELS[part] ?? part} part.`
              : `${total.toLocaleString()} ${total === 1 ? 'work' : 'works'} found.`}
          </p>

          <div className="space-y-2">
            {works.map((work) => (
              <div key={work.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <h2 className="font-medium">{work.title}</h2>
                  {work.artist && (
                    <span className="text-sm text-muted-foreground">— {work.artist}</span>
                  )}
                  <span className="text-xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                    {work.ensemble}
                  </span>
                </div>

                {work.parts.length === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">No parts catalogued yet.</p>
                ) : (
                  <div className="mt-3 space-y-1.5">
                    {work.parts.map((p) => (
                      <div
                        key={p.id}
                        className="flex flex-wrap items-center gap-2 text-sm border-t pt-1.5 first:border-t-0 first:pt-0"
                      >
                        <span className="font-medium min-w-[5.5rem]">
                          {PART_LABELS[p.part] ?? p.part}
                          {p.substitute && p.played_on && (
                            <span className="font-normal text-muted-foreground">
                              {' '}for {PART_LABELS[p.played_on] ?? p.played_on}
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
                          {p.original_filename}
                          {formatBytes(p.bytes) && ` · ${formatBytes(p.bytes)}`}
                        </span>

                        {p.available ? (
                          <span className="flex gap-1.5 shrink-0">
                            <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                              {/* noreferrer keeps the signed R2 URL out of any Referer chain */}
                              <a
                                href={`/api/library/parts/${p.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Preview
                              </a>
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                              <a href={`/api/library/parts/${p.id}?download=1`} rel="noreferrer">
                                Download
                              </a>
                            </Button>
                          </span>
                        ) : (
                          <span className="text-xs text-amber-700 dark:text-amber-400 shrink-0">
                            Not uploaded
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {lastPage > 0 && (
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page + 1} of {lastPage + 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= lastPage || loading}
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
