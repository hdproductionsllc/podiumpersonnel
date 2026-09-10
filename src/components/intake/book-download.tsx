'use client'

/**
 * Book downloads (Book Builder Phase C) — shown on a CONFIRMED intake.
 *
 * Two modes, per musician:
 *   COMBINED (default) — one merged PDF per book: playlist page first, then
 *     every song's part in performance order. A STRUCTURAL merge (pdf-lib
 *     copyPages): pages, fonts, vectors and image streams are copied verbatim,
 *     never re-rendered or recompressed — no artifacting. The Acrobat
 *     combine-by-number step, automated.
 *   ZIP — "00 - Playlist.pdf" + every song as "NN - Title - Artist - part.pdf"
 *     (byte-identical originals, STORE), for combining by hand.
 *
 * Assembly happens entirely in the browser: the manifest API returns presigned
 * R2 URLs; bytes are fetched straight from R2; nothing passes through a
 * serverless route.
 */

import { useState } from 'react'
import { zipSync, type Zippable } from 'fflate'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import {
  buildPlaylistPdf,
  matchInstrumentForPart,
  mergePdfs,
  normalizeForFilename,
  type BookPart,
  type InstrumentRef,
  type MergeSource,
  type PlaylistHeader,
} from '@/lib/intake/book-builder'

interface ManifestSong {
  num: number
  section: string
  title: string
  artist: string | null
  role: string | null
  notes: string | null
  specialRequest: boolean
  files: Record<string, { url: string; zipName: string }>
  missingParts: string[]
}

interface Manifest {
  header: PlaylistHeader
  parts: BookPart[]
  /** The score book, present only when at least one song actually has a score. */
  scorePart: BookPart | null
  /** How many songs have one — the library does not have scores for everything. */
  scoreCount: number
  songs: ManifestSong[]
  warnings: string[]
}

function saveBlob(bytes: Uint8Array, filename: string, type: string) {
  const blob = new Blob([bytes as BlobPart], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

interface BookDownloadProps {
  projectId: string
  /** The project's position instruments, for routing each book to the right
   *  chair when publishing to Music / Parts. */
  instruments?: InstrumentRef[]
  /** Owner's sign-off timestamp that the books are ready to send (071);
   *  null = not approved. Gates the publish step. */
  booksApprovedAt: string | null
  onApprovalChange: (ts: string | null) => void
  /** The intake's Spotify playlist URL, or null when there isn't one yet. The
   *  book covers print it as a clickable link, so building before it exists
   *  produces books that have to be rebuilt once the playlist is made. Passed
   *  from the panel (not read off the manifest) so the notice below appears
   *  immediately and clears the moment the playlist is created. */
  playlistUrl: string | null
}

interface PublishRow {
  part: string
  label: string
  /** Target instrument id, or 'skip' for "Don't send". */
  instrumentId: string
}

/** Marker on published book files — how re-publishing recognizes (and
 *  replaces) the previous version for an instrument. Keep stable. */
const BOOK_NOTES = 'Book from confirmed client selections — playlist first, songs in performance order.'

export function BookDownload({
  projectId,
  instruments = [],
  booksApprovedAt,
  onApprovalChange,
  playlistUrl,
}: BookDownloadProps) {
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [loading, setLoading] = useState(false)
  const [building, setBuilding] = useState<string | null>(null) // part or 'all'
  const [progress, setProgress] = useState('')
  const [combined, setCombined] = useState(true)
  // Off by default: a score book is an extra for the contractor/conductor, not
  // something any player is waiting on, and the library has scores for only some
  // works. Nobody should get one unless they ask.
  const [includeScore, setIncludeScore] = useState(false)
  // The publish confirmation step: book → instrument routing awaiting approval.
  const [publishPlan, setPublishPlan] = useState<PublishRow[] | null>(null)

  /**
   * The manifest holds presigned R2 URLs for the files as they were when it was
   * fetched. Anything that changes what a song points at — replacing a part,
   * restoring an archived work, re-matching a row — leaves a cached manifest
   * serving the OLD files, on a page that looks perfectly current. The links
   * also expire (SIGNED_GET_TTL_SECONDS), so a tab left open long enough starts
   * handing out dead URLs.
   *
   * So every actual BUILD re-fetches. The cached copy is only for rendering the
   * part list and warnings, where being a moment stale costs nothing.
   */
  async function loadManifest(fresh = false): Promise<Manifest | null> {
    if (manifest && !fresh) return manifest
    setLoading(true)
    try {
      const res = await fetch(`/api/intake/${projectId}/book`)
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Could not prepare the books.')
        return null
      }
      setManifest(data as Manifest)
      return data as Manifest
    } catch {
      toast.error('Could not prepare the books.')
      return null
    } finally {
      setLoading(false)
    }
  }

  /**
   * The books this build produces. The score is appended only when the admin
   * asked for it AND the manifest actually has one, so a stale checkbox on a
   * project with no scores can never produce an empty score book.
   */
  function partsToBuild(m: Manifest): BookPart[] {
    return includeScore && m.scorePart ? [...m.parts, m.scorePart] : m.parts
  }

  /** Fetch every unique file url once; return bytes keyed by url. */
  async function fetchFiles(m: Manifest, parts: BookPart[]): Promise<Map<string, Uint8Array>> {
    const urls = new Set<string>()
    for (const song of m.songs) {
      for (const bp of parts) {
        const f = song.files[bp.part]
        if (f) urls.add(f.url)
      }
    }
    const bytesByUrl = new Map<string, Uint8Array>()
    let done = 0
    const list = [...urls]
    // Modest concurrency so a 40-song book doesn't fire 160 requests at once.
    const CONCURRENCY = 6
    for (let i = 0; i < list.length; i += CONCURRENCY) {
      await Promise.all(
        list.slice(i, i + CONCURRENCY).map(async (url) => {
          const res = await fetch(url)
          if (!res.ok) throw new Error(`A part file failed to download (${res.status}).`)
          bytesByUrl.set(url, new Uint8Array(await res.arrayBuffer()))
          done += 1
          setProgress(`Downloading parts… ${done}/${list.length}`)
        })
      )
    }
    return bytesByUrl
  }

  /** The merge inputs for one instrument's book: playlist first, then songs in order. */
  async function bookSources(
    m: Manifest,
    bp: BookPart,
    bytesByUrl: Map<string, Uint8Array>
  ): Promise<MergeSource[]> {
    const sources: MergeSource[] = [
      { name: '00 - Playlist.pdf', bytes: await buildPlaylistPdf(m.header, m.songs, bp.label) },
    ]
    for (const song of m.songs) {
      const f = song.files[bp.part]
      if (!f) continue
      const bytes = bytesByUrl.get(f.url)
      if (bytes) sources.push({ name: f.zipName, bytes })
    }
    return sources
  }

  /** Zip entries for one instrument's book (flat: 00 playlist + numbered parts). */
  async function bookEntries(
    m: Manifest,
    bp: BookPart,
    bytesByUrl: Map<string, Uint8Array>
  ): Promise<Zippable> {
    const entries: Zippable = {}
    for (const src of await bookSources(m, bp, bytesByUrl)) {
      entries[src.name] = [src.bytes, { level: 0 }] // byte-identical, STORE
    }
    return entries
  }

  async function downloadOne(bp: BookPart) {
    const m = await loadManifest(true)
    if (!m) return
    setBuilding(bp.part)
    try {
      const bytesByUrl = await fetchFiles(m, [bp])
      const client = normalizeForFilename(m.header.client)
      if (combined) {
        setProgress('Combining the book…')
        const pdf = await mergePdfs(await bookSources(m, bp, bytesByUrl))
        saveBlob(pdf, `${client} - ${bp.label}.pdf`, 'application/pdf')
      } else {
        setProgress('Building the zip…')
        const zip = zipSync((await bookEntries(m, bp, bytesByUrl)) as Parameters<typeof zipSync>[0])
        saveBlob(zip, `${client} - ${bp.label}.zip`, 'application/zip')
      }
      toast.success(`${bp.label} book downloaded.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Book build failed.')
    } finally {
      setBuilding(null)
      setProgress('')
    }
  }

  async function downloadAll() {
    const m = await loadManifest(true)
    if (!m) return
    setBuilding('all')
    try {
      const built = partsToBuild(m)
      const bytesByUrl = await fetchFiles(m, built)
      const client = normalizeForFilename(m.header.client)
      const root: Zippable = {}
      if (combined) {
        for (const bp of built) {
          setProgress(`Combining ${bp.label}…`)
          const pdf = await mergePdfs(await bookSources(m, bp, bytesByUrl))
          root[`${client} - ${bp.label}.pdf`] = [pdf, { level: 0 }]
        }
      } else {
        setProgress('Building the zip…')
        for (const bp of built) {
          root[bp.folder] = await bookEntries(m, bp, bytesByUrl)
        }
      }
      // Instrument-agnostic printable playlist at the top level (Mac layout).
      root[`00 - ${client} Playlist.pdf`] = [await buildPlaylistPdf(m.header, m.songs, null), { level: 0 }]
      const zip = zipSync(root as Parameters<typeof zipSync>[0])
      saveBlob(zip, `${client} - Books.zip`, 'application/zip')
      toast.success('All books downloaded.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Book build failed.')
    } finally {
      setBuilding(null)
      setProgress('')
    }
  }

  /** Record (or revoke) the owner's sign-off that the books are ready to send. */
  async function approveBooks(approved: boolean) {
    setBuilding('approve')
    try {
      const res = await fetch(`/api/intake/${projectId}/approve-books`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Could not update the approval.')
        return
      }
      onApprovalChange(data.booksApprovedAt ?? null)
      toast.success(approved ? 'Books approved — ready to send.' : 'Approval revoked.')
    } catch {
      toast.error('Could not update the approval.')
    } finally {
      setBuilding(null)
    }
  }

  /**
   * NOTHING publishes without the admin confirming the routing: clicking
   * "Send to Music / Parts" builds a PLAN (book → instrument, pre-filled by
   * exact-name matching), the admin reviews/fixes each dropdown, and only
   * "Publish" executes it. An unmatched book defaults to "Don't send".
   */
  function openPublishPlan() {
    void (async () => {
      const m = await loadManifest(true)
      if (!m) return
      if (instruments.length === 0) {
        toast.error('This project has no positions yet — add positions before sending books.')
        return
      }
      // The score appears in the plan only when it was built. It matches no
      // instrument, so it defaults to "Don't send" and has to be routed
      // deliberately — a score belongs to whoever is directing, not to a chair.
      setPublishPlan(
        partsToBuild(m).map((bp) => ({
          part: bp.part,
          label: bp.label,
          instrumentId: matchInstrumentForPart(bp.part, instruments)?.id ?? 'skip',
        }))
      )
    })()
  }

  /**
   * Publish the combined books into the project's Music / Parts section per
   * the confirmed plan — the existing Send Music flow handles delivery to
   * musicians from there. Rides the exact rails of a manual upload: signed
   * upload to Supabase Storage, then the metadata call with scope 'assigned'.
   */
  async function publishToMusicParts(plan: PublishRow[]) {
    const m = await loadManifest(true)
    if (!m) return
    const active = plan.filter((r) => r.instrumentId !== 'skip')
    if (active.length === 0) {
      toast.error('Every book is set to "Don\'t send" — pick at least one instrument.')
      return
    }
    const chosen = active.map((r) => r.instrumentId)
    if (new Set(chosen).size !== chosen.length) {
      toast.error('Two books are routed to the same instrument — fix the dropdowns.')
      return
    }
    setBuilding('publish')
    try {
      const activeParts = m.parts.filter((bp) => active.some((r) => r.part === bp.part))
      const bytesByUrl = await fetchFiles(m, activeParts)
      const supabase = createClient()
      const client = normalizeForFilename(m.header.client)

      // Auto-versioning: find the PREVIOUS book per instrument (recognized by
      // the BOOK_NOTES marker + assignment) so it can be replaced, not stacked.
      interface ExistingFile {
        id: string
        notes: string | null
        project_file_instruments: Array<{ instrument_id: string }>
      }
      let existingBooks: ExistingFile[] = []
      try {
        const listRes = await fetch(`/api/projects/${projectId}/files`)
        const listData = await listRes.json()
        if (listRes.ok && Array.isArray(listData.files)) {
          existingBooks = (listData.files as ExistingFile[]).filter((f) => f.notes === BOOK_NOTES)
        }
      } catch (err) {
        /* listing failure just means no replacement this round */
        console.warn('book-download: could not list existing books:', err)
      }

      let published = 0
      let replaced = 0
      for (const bp of activeParts) {
        const inst = instruments.find((i) => i.id === active.find((r) => r.part === bp.part)!.instrumentId)
        if (!inst) continue
        setProgress(`Combining ${bp.label}…`)
        const pdf = await mergePdfs(await bookSources(m, bp, bytesByUrl))
        const fileName = `${client} - ${bp.label} Book.pdf`

        setProgress(`Uploading ${bp.label}…`)
        const urlRes = await fetch(`/api/projects/${projectId}/files/upload-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, fileSize: pdf.length, mimeType: 'application/pdf' }),
        })
        const urlData = await urlRes.json()
        if (!urlRes.ok) throw new Error(urlData.error || `Could not start the upload for ${bp.label}.`)

        const up = await supabase.storage
          .from('project-files')
          .uploadToSignedUrl(urlData.path, urlData.token, new Blob([pdf as BlobPart], { type: 'application/pdf' }))
        if (up.error) throw new Error(`Upload failed for ${bp.label}: ${up.error.message}`)

        const metaRes = await fetch(`/api/projects/${projectId}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storagePath: urlData.path,
            fileName,
            scope: 'assigned',
            instrumentIds: [inst.id],
            notes: BOOK_NOTES,
          }),
        })
        if (!metaRes.ok) {
          const metaData = await metaRes.json().catch(() => ({}))
          throw new Error(metaData.error || `Could not record ${bp.label} in Music / Parts.`)
        }
        published += 1

        // New version is safely in place — retire the previous book for this
        // instrument (delete AFTER insert so a failure never leaves zero books).
        const stale = existingBooks.filter((f) =>
          f.project_file_instruments.some((fi) => fi.instrument_id === inst.id)
        )
        for (const f of stale) {
          try {
            const del = await fetch(`/api/projects/${projectId}/files/${f.id}`, { method: 'DELETE' })
            if (del.ok) replaced += 1
          } catch (err) {
            /* stale copy remains; harmless, admin can delete by hand */
            console.warn('book-download: could not delete previous book version:', err)
          }
        }
      }
      toast.success(
        `${published} book${published === 1 ? '' : 's'} added to Music / Parts` +
          (replaced > 0 ? ` (${replaced} previous version${replaced === 1 ? '' : 's'} replaced)` : '') +
          ' — use Send Music there to email the musicians.'
      )
      setPublishPlan(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Publishing failed.')
    } finally {
      setBuilding(null)
      setProgress('')
    }
  }

  return (
    <div className="rounded-md border bg-background p-3 space-y-2">
      <div className="flex items-center gap-2">
        <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Books</h5>
        {progress && <span className="text-xs text-muted-foreground">{progress}</span>}
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={combined}
          onChange={(e) => setCombined(e.target.checked)}
          className="h-3.5 w-3.5"
          disabled={building !== null}
        />
        Combine each book into one PDF (playlist first, songs in order — no re-rendering, pages copied exactly)
      </label>
      <p className="text-xs text-muted-foreground">
        {combined
          ? 'Each musician gets a single ready-to-play PDF.'
          : 'Each book is a zip: 00 - Playlist.pdf plus every song as "NN - Title - Artist - part.pdf" — sort by filename to combine by number.'}
      </p>

      {/* Optional score book. Only offered once the manifest confirms at least
          one song actually has a score — the library does not have them for
          everything, and an empty book helps nobody. */}
      {manifest && manifest.scorePart && (
        <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={includeScore}
            onChange={(e) => setIncludeScore(e.target.checked)}
            className="h-3.5 w-3.5 mt-0.5 shrink-0"
            disabled={building !== null}
          />
          <span>
            Also build a score book
            {manifest.scoreCount < manifest.songs.length && (
              <>
                {' '}
                <span className="text-amber-700 dark:text-amber-400">
                  ({manifest.scoreCount} of {manifest.songs.length} songs have a score — the rest are
                  left out)
                </span>
              </>
            )}
            {manifest.scoreCount === manifest.songs.length && ' (every song has one)'}
          </span>
        </label>
      )}
      {/* The books' cover carries the playlist link, so the playlist is a
          DEPENDENCY of the build. Building first means rebuilding later — which
          is exactly what happened in real use: books downloaded with no link,
          playlist created, books built all over again. Say so before the build,
          not after. Not a block: a rush job with no playlist is legitimate. */}
      {!playlistUrl && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 p-2">
          <p className="text-xs text-amber-800 dark:text-amber-300">
            <span className="font-semibold">No Spotify playlist yet.</span> The playlist link is
            printed on each book&rsquo;s cover, so books built now won&rsquo;t carry it and
            you&rsquo;d have to build them again after creating it. Create the playlist just above
            first — or carry on if you don&rsquo;t need the link.
          </p>
        </div>
      )}

      {/* Step 1 — assemble + download for review */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-muted-foreground w-4">1.</span>
        <Button size="sm" onClick={downloadAll} disabled={building !== null || loading}>
          {building === 'all' ? 'Building…' : 'Download all books'}
        </Button>
        {(manifest ? partsToBuild(manifest) : []).map((bp) => (
          <Button
            key={bp.part}
            size="sm"
            variant="outline"
            onClick={() => downloadOne(bp)}
            disabled={building !== null || loading}
          >
            {building === bp.part ? 'Building…' : bp.label}
          </Button>
        ))}
        {!manifest && (
          <Button size="sm" variant="ghost" onClick={() => void loadManifest()} disabled={loading}>
            {loading ? 'Checking…' : 'Show per-musician downloads'}
          </Button>
        )}
      </div>

      {/* Step 2 — the owner's sign-off gate */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-muted-foreground w-4">2.</span>
        {booksApprovedAt ? (
          <>
            <span className="inline-flex items-center rounded-md border border-green-300 bg-green-50 dark:border-green-900/60 dark:bg-green-950/30 px-2 py-0.5 text-xs font-medium text-green-800 dark:text-green-300">
              ✓ Books approved {new Date(booksApprovedAt).toLocaleString()}
            </span>
            <Button size="sm" variant="ghost" onClick={() => void approveBooks(false)} disabled={building !== null}>
              Revoke
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={() => void approveBooks(true)} disabled={building !== null}>
              {building === 'approve' ? 'Saving…' : 'Approve books — they look good'}
            </Button>
            <span className="text-xs text-muted-foreground">Download and review them first.</span>
          </>
        )}
      </div>

      {/* Step 3 — route to musicians (gated on approval) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-muted-foreground w-4">3.</span>
        <Button
          size="sm"
          variant="secondary"
          onClick={openPublishPlan}
          disabled={building !== null || loading || !booksApprovedAt || publishPlan !== null}
          title={booksApprovedAt ? undefined : 'Approve the books first (step 2)'}
        >
          Send to Music / Parts
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Adds each book to this project&apos;s files, assigned to its instrument — then use{' '}
          <span className="font-medium">Send Music</span> there to email the musicians.
        </span>
      </div>

      {/* Routing confirmation — nothing publishes until this is approved */}
      {publishPlan && (
        <div className="rounded-md border border-dashed p-3 space-y-2">
          <p className="text-xs font-semibold">Confirm where each book goes:</p>
          <ul className="space-y-1.5">
            {publishPlan.map((row) => (
              <li key={row.part} className="flex items-center gap-2">
                <span className="text-sm w-24 shrink-0">{row.label}</span>
                <span className="text-xs text-muted-foreground">→</span>
                <Select
                  value={row.instrumentId}
                  onValueChange={(v) =>
                    setPublishPlan((prev) =>
                      prev ? prev.map((r) => (r.part === row.part ? { ...r, instrumentId: v } : r)) : prev
                    )
                  }
                  disabled={building !== null}
                >
                  <SelectTrigger className="h-8 w-52 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {instruments.map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                    ))}
                    <SelectItem value="skip">Don&apos;t send</SelectItem>
                  </SelectContent>
                </Select>
                {row.instrumentId === 'skip' && (
                  <span className="text-xs text-amber-700 dark:text-amber-400">no match — pick one or leave out</span>
                )}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={() => void publishToMusicParts(publishPlan)} disabled={building !== null}>
              {building === 'publish' ? 'Publishing…' : 'Publish books'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPublishPlan(null)} disabled={building !== null}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {manifest && manifest.warnings.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 p-2">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-0.5">
            Heads up — these songs won&apos;t have files in the books:
          </p>
          <ul className="list-disc pl-5 space-y-0.5">
            {manifest.warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-800 dark:text-amber-300">{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
