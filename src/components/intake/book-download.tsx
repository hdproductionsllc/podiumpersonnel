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
import { toast } from 'sonner'
import {
  buildPlaylistPdf,
  mergePdfs,
  normalizeForFilename,
  type BookPart,
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

export function BookDownload({ projectId }: { projectId: string }) {
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [loading, setLoading] = useState(false)
  const [building, setBuilding] = useState<string | null>(null) // part or 'all'
  const [progress, setProgress] = useState('')
  const [combined, setCombined] = useState(true)

  async function loadManifest(): Promise<Manifest | null> {
    if (manifest) return manifest
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
    const m = await loadManifest()
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
    const m = await loadManifest()
    if (!m) return
    setBuilding('all')
    try {
      const bytesByUrl = await fetchFiles(m, m.parts)
      const client = normalizeForFilename(m.header.client)
      const root: Zippable = {}
      if (combined) {
        for (const bp of m.parts) {
          setProgress(`Combining ${bp.label}…`)
          const pdf = await mergePdfs(await bookSources(m, bp, bytesByUrl))
          root[`${client} - ${bp.label}.pdf`] = [pdf, { level: 0 }]
        }
      } else {
        setProgress('Building the zip…')
        for (const bp of m.parts) {
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
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={downloadAll} disabled={building !== null || loading}>
          {building === 'all' ? 'Building…' : 'Download all books'}
        </Button>
        {(manifest?.parts ?? []).map((bp) => (
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
