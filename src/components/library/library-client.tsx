'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
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
  is_active: boolean
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

const SORTS = [
  { value: 'title', label: 'Title A–Z' },
  { value: 'title-desc', label: 'Title Z–A' },
  { value: 'artist', label: 'Artist A–Z' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
]

const PART_LABELS: Record<string, string> = Object.fromEntries(
  PARTS.filter((p) => p.value).map((p) => [p.value, p.label])
)

/** Compact codes for the dense view — a whole work's parts fit on one line. */
const PART_SHORT: Record<string, string> = {
  vln1: 'V1', vln2: 'V2', vla: 'Va', vc: 'Vc', bass: 'Bs',
  voice: 'Vo', organ: 'Or', score: 'Sc', other: '—',
}

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** sha256 of a file, hex — the key the library is content-addressed by. */
async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}


interface PartVersion {
  id: string
  original_filename: string
  bytes: number | null
  replaced_at: string
  restorable: boolean
}

/**
 * One part, with everything you can do to it. Defined once and used by BOTH the
 * compact and detailed views — the first cut put Replace only in the detailed
 * view while defaulting to compact, which hid it completely.
 */
function PartRow({
  work, part, busyId, versions, historyUnavailable, onToggleVersions, onReplace, onDelete, onRestoreVersion,
}: {
  work: LibraryWork
  part: LibraryPart
  busyId: string | null
  versions: PartVersion[] | undefined
  historyUnavailable: boolean
  onToggleVersions: () => void
  onReplace: (file: File) => void
  onDelete: () => void
  onRestoreVersion: (versionId: string) => void
}) {
  const busy = busyId === part.id
  return (
    <div className="border-t pt-1.5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium min-w-[5.5rem]">
          {PART_LABELS[part.part] ?? part.part}
          {part.substitute && part.played_on && (
            <span className="font-normal text-muted-foreground">
              {' '}for {PART_LABELS[part.played_on] ?? part.played_on}
            </span>
          )}
        </span>
        <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
          {part.original_filename}
          {formatBytes(part.bytes) && ` \u00b7 ${formatBytes(part.bytes)}`}
        </span>

        <span className="flex gap-1.5 shrink-0 items-center">
          {part.available ? (
            <>
              <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                <a href={`/api/library/parts/${part.id}`} target="_blank" rel="noopener noreferrer">
                  Preview
                </a>
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                <a href={`/api/library/parts/${part.id}?download=1`} rel="noreferrer">
                  Download
                </a>
              </Button>
            </>
          ) : (
            <span className="text-xs text-amber-700 dark:text-amber-400">Not uploaded</span>
          )}

          <label className="cursor-pointer">
            <span className="inline-flex h-7 items-center rounded-md border px-2 text-xs hover:bg-accent">
              {busy ? 'Working\u2026' : 'Replace'}
            </span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) onReplace(f)
              }}
            />
          </label>

          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onToggleVersions}>
            {versions ? 'Hide history' : 'History'}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-red-600 hover:text-red-700"
            disabled={busy}
            onClick={onDelete}
          >
            Remove
          </Button>
        </span>
      </div>

      {versions && (
        <div className="mt-1.5 ml-2 border-l pl-3 space-y-1">
          {historyUnavailable ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Version history isn&apos;t switched on for this database yet, so replacements
              aren&apos;t being recorded. Replace still works — the old file just isn&apos;t kept.
            </p>
          ) : versions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No previous arrangements — this part has never been replaced.
            </p>
          ) : (
            versions.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground truncate flex-1 min-w-0">
                  {v.original_filename}
                  {formatBytes(v.bytes) && ` \u00b7 ${formatBytes(v.bytes)}`}
                  {' \u00b7 replaced '}
                  {new Date(v.replaced_at).toLocaleDateString()}
                </span>
                {v.restorable ? (
                  <span className="flex gap-1.5 shrink-0">
                    <a
                      href={`/api/library/parts/${part.id}?versionId=${v.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      View
                    </a>
                    <button
                      type="button"
                      className="underline underline-offset-2 hover:text-foreground"
                      onClick={() => onRestoreVersion(v.id)}
                    >
                      Put back
                    </button>
                  </span>
                ) : (
                  <span className="text-muted-foreground shrink-0">no file</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function LibraryClient({ totalWorks }: { totalWorks: number }) {
  const [query, setQuery] = useState('')
  const [ensemble, setEnsemble] = useState('')
  const [part, setPart] = useState('')
  const [sort, setSort] = useState('title')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [compact, setCompact] = useState(true)
  const [pageSize, setPageSize] = useState(100)
  const [page, setPage] = useState(0)

  const [works, setWorks] = useState<LibraryWork[]>([])
  const [total, setTotal] = useState(0)
  const [partFiltered, setPartFiltered] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [versions, setVersions] = useState<Record<string, PartVersion[]>>({})
  /** Parts whose history could not be read because migration 079 is unapplied. */
  const [unavailable, setUnavailable] = useState<Set<string>>(new Set())

  // Guards the search race: a slower earlier request must not overwrite a newer one.
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
      params.set('sort', sort)
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))
      if (includeArchived) params.set('includeArchived', '1')

      const res = await fetch(`/api/library/search?${params.toString()}`)
      const data = await res.json().catch(() => ({}))
      if (id !== requestId.current) return
      if (!res.ok) throw new Error(data.error || 'Could not load the library.')

      setWorks(data.works ?? [])
      setTotal(data.total ?? 0)
      setPartFiltered(!!data.partFiltered)
    } catch (err) {
      if (id !== requestId.current) return
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setWorks([])
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [query, ensemble, part, sort, page, pageSize, includeArchived])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  // Changing what you're looking at returns to the first page — staying on page 7
  // of a new result set shows nothing and reads as "no matches".
  useEffect(() => {
    setPage(0)
  }, [query, ensemble, part, sort, pageSize, includeArchived])

  async function toggleVersions(part: LibraryPart) {
    if (versions[part.id]) {
      setVersions((v) => {
        const next = { ...v }
        delete next[part.id]
        return next
      })
      return
    }
    try {
      const res = await fetch(`/api/library/parts/${part.id}/versions`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not load history.')
      // Migration 079 not applied: no history is being recorded, which is not
      // the same as this part never having been replaced.
      setUnavailable((u) => {
        const next = new Set(u)
        if (data.unavailable) next.add(part.id)
        else next.delete(part.id)
        return next
      })
      setVersions((v) => ({ ...v, [part.id]: data.versions ?? [] }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  async function restoreVersion(work: LibraryWork, part: LibraryPart, versionId: string) {
    setBusyId(part.id)
    setNotice(null)
    try {
      const res = await fetch(`/api/library/parts/${part.id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not restore that version.')
      setNotice(`Put back "${data.restored}" on ${PART_LABELS[part.part] ?? part.part}.`)
      setVersions((v) => {
        const next = { ...v }
        delete next[part.id]
        return next
      })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusyId(null)
    }
  }

  async function setArchived(work: LibraryWork, archived: boolean) {
    setBusyId(work.id)
    setNotice(null)
    try {
      const res = await fetch(`/api/library/works/${work.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not update that work.')

      // Reflect it locally so the row doesn't jump before you've read the result.
      setWorks((prev) =>
        prev.map((w) => (w.id === work.id ? { ...w, is_active: !archived } : w))
      )
      setNotice(
        archived
          ? `Archived "${work.title}". It stops matching new questionnaires and can be restored ` +
            `any time. It does NOT unlink projects already matched to it — those books still ` +
            `build from these files. To swap the arrangement, use Replace on each part instead.`
          : `Restored "${work.title}".`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusyId(null)
    }
  }

  async function deletePart(work: LibraryWork, p: LibraryPart) {
    const label = PART_LABELS[p.part] ?? p.part
    if (!confirm(`Remove the ${label} part from "${work.title}"?\n\nThe PDF stays in storage; only this part entry is removed.`)) {
      return
    }

    setBusyId(p.id)
    setNotice(null)
    try {
      const res = await fetch(`/api/library/parts/${p.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not remove that part.')

      setWorks((prev) =>
        prev.map((w) =>
          w.id === work.id ? { ...w, parts: w.parts.filter((x) => x.id !== p.id) } : w
        )
      )
      setNotice(`Removed the ${label} part from "${work.title}".`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusyId(null)
    }
  }

  async function replacePart(work: LibraryWork, p: LibraryPart, file: File) {
    if (!/\.pdf$/i.test(file.name)) {
      setError('Only PDF files can be added to the library.')
      return
    }

    setBusyId(p.id)
    setError(null)
    setNotice(null)
    try {
      // Hash first: the key is content-addressed, so the hash IS the address.
      const sha256 = await sha256Hex(file)

      const urlRes = await fetch('/api/repertoire/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha256, bytes: file.size, filename: file.name }),
      })
      const urlData = await urlRes.json().catch(() => ({}))
      if (!urlRes.ok) throw new Error(urlData.error || 'Could not start the upload.')

      // Skipped when these exact bytes are already stored — content addressing
      // makes a re-upload of identical content unnecessary.
      if (urlData.uploadUrl) {
        const put = await fetch(urlData.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/pdf' },
          body: file,
        })
        if (!put.ok) throw new Error('The upload failed. Please try again.')
      }

      const res = await fetch(`/api/library/parts/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha256, bytes: file.size, filename: file.name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not replace that part.')

      setWorks((prev) =>
        prev.map((w) =>
          w.id === work.id
            ? {
                ...w,
                parts: w.parts.map((x) =>
                  x.id === p.id
                    ? { ...x, original_filename: file.name, bytes: file.size, available: true }
                    : x
                ),
              }
            : w
        )
      )
      setVersions((v) => {
        const next = { ...v }
        delete next[p.id]
        return next
      })
      setNotice(
        `Replaced the ${PART_LABELS[p.part] ?? p.part} part on "${work.title}". ` +
          'The old arrangement is kept under History.'
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusyId(null)
    }
  }

  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Music Library</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalWorks.toLocaleString()} works on the shelf.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCompact((c) => !c)}>
          {compact ? 'Detailed view' : 'Compact view'}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title or artist…"
          className="sm:max-w-xs"
          aria-label="Search the music library"
        />
        <select value={ensemble} onChange={(e) => setEnsemble(e.target.value)}
          aria-label="Filter by ensemble"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          {ENSEMBLES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={part} onChange={(e) => setPart(e.target.value)}
          aria-label="Filter by part"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          {PARTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}
          aria-label="Sort"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          {SORTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
          aria-label="Results per page"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          {[50, 100, 200].map((n) => <option key={n} value={n}>{n} per page</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <input type="checkbox" checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)} />
          Show archived
        </label>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-md border border-green-200 bg-green-50 dark:bg-green-950/30 p-3 text-sm text-green-800 dark:text-green-200">
          {notice}
        </div>
      )}

      {loading && works.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : works.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {query || ensemble || part ? 'Nothing matches those filters.' : 'The library is empty.'}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {partFiltered
              ? `Showing works on this page with a ${PART_LABELS[part] ?? part} part.`
              : `${total.toLocaleString()} ${total === 1 ? 'work' : 'works'}.`}
          </p>

          {compact ? (
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Title</th>
                    <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">Artist</th>
                    <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Ensemble</th>
                    <th className="px-3 py-2 text-left font-medium">Parts</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {works.map((work) => (
                    <Fragment key={work.id}>
                    <tr className={`border-t ${!work.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-3 py-2">
                        {work.title}
                        {!work.is_active && (
                          <span className="ml-2 text-xs text-muted-foreground">(archived)</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">
                        {work.artist || '—'}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">
                        {work.ensemble}
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex flex-wrap gap-1">
                          {work.parts.length === 0 && (
                            <span className="text-xs text-muted-foreground">none</span>
                          )}
                          {work.parts.map((p) => (
                            p.available ? (
                              <a
                                key={p.id}
                                href={`/api/library/parts/${p.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`${PART_LABELS[p.part] ?? p.part} — ${p.original_filename}`}
                                className="rounded bg-muted px-1.5 py-0.5 text-xs hover:bg-accent hover:underline"
                              >
                                {PART_SHORT[p.part] ?? p.part}
                              </a>
                            ) : (
                              <span
                                key={p.id}
                                title={`${PART_LABELS[p.part] ?? p.part} — not uploaded`}
                                className="rounded border border-dashed px-1.5 py-0.5 text-xs text-muted-foreground"
                              >
                                {PART_SHORT[p.part] ?? p.part}
                              </span>
                            )
                          ))}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setExpanded((e) => ({ ...e, [work.id]: !e[work.id] }))}
                        >
                          {expanded[work.id] ? 'Close' : 'Manage'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={busyId === work.id}
                          onClick={() => setArchived(work, work.is_active)}
                        >
                          {work.is_active ? 'Archive' : 'Restore'}
                        </Button>
                      </td>
                    </tr>
                    {expanded[work.id] && (
                      <tr className="border-t bg-muted/20">
                        <td colSpan={5} className="px-3 py-3">
                          {work.parts.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No parts catalogued yet.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {work.parts.map((p) => (
                                <PartRow
                                  key={p.id}
                                  work={work}
                                  part={p}
                                  busyId={busyId}
                                  versions={versions[p.id]}
                                  historyUnavailable={unavailable.has(p.id)}
                                  onToggleVersions={() => toggleVersions(p)}
                                  onReplace={(f) => replacePart(work, p, f)}
                                  onDelete={() => deletePart(work, p)}
                                  onRestoreVersion={(vId) => restoreVersion(work, p, vId)}
                                />
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-2">
              {works.map((work) => (
                <div key={work.id} className={`rounded-lg border p-4 ${!work.is_active ? 'opacity-60' : ''}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <h2 className="font-medium">{work.title}</h2>
                      {work.artist && (
                        <span className="text-sm text-muted-foreground">— {work.artist}</span>
                      )}
                      <span className="text-xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                        {work.ensemble}
                      </span>
                      {!work.is_active && (
                        <span className="text-xs rounded-full bg-amber-100 dark:bg-amber-950 px-2 py-0.5 text-amber-800 dark:text-amber-200">
                          Archived
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={busyId === work.id}
                      onClick={() => setArchived(work, work.is_active)}
                    >
                      {work.is_active ? 'Archive' : 'Restore'}
                    </Button>
                  </div>

                  {work.parts.length === 0 ? (
                    <p className="mt-3 text-xs text-muted-foreground">No parts catalogued yet.</p>
                  ) : (
                    <div className="mt-3 space-y-1.5">
                      {work.parts.map((p) => (
                        <PartRow
                          key={p.id}
                          work={work}
                          part={p}
                          busyId={busyId}
                          versions={versions[p.id]}
                          historyUnavailable={unavailable.has(p.id)}
                          onToggleVersions={() => toggleVersions(p)}
                          onReplace={(f) => replacePart(work, p, f)}
                          onDelete={() => deletePart(work, p)}
                          onRestoreVersion={(vId) => restoreVersion(work, p, vId)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {lastPage > 0 && (
            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" size="sm" disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}>
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page + 1} of {lastPage + 1}
              </span>
              <Button variant="outline" size="sm" disabled={page >= lastPage || loading}
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}>
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
