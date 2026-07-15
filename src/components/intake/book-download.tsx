'use client'

/**
 * Book downloads (Book Builder Phase C) — shown on a CONFIRMED intake.
 *
 * Per musician: one zip with "00 - Playlist.pdf" + every song's part PDF named
 * "NN - Title - Artist - part.pdf", so sorting by filename IS the performance
 * order (the owner combines them in Acrobat by number). "All books" bundles a
 * folder per instrument plus the instrument-agnostic printable playlist —
 * the exact layout the Mac gig_compiler produced.
 *
 * Assembly happens entirely in the browser: the manifest API returns presigned
 * R2 URLs; bytes are fetched straight from R2 (byte-identical — the fidelity
 * rule), the playlist PDF is generated locally, and fflate zips it all up
 * (STORE, no recompression). No file bytes ever pass through a serverless route.
 */

import { useState } from 'react'
import { zipSync, type Zippable } from 'fflate'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  buildPlaylistPdf,
  normalizeForFilename,
  type BookPart,
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

function saveBlob(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/zip' })
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

  /** Zip entries for one instrument's book (flat: 00 playlist + numbered parts). */
  async function bookEntries(
    m: Manifest,
    bp: BookPart,
    bytesByUrl: Map<string, Uint8Array>
  ): Promise<Zippable> {
    const entries: Zippable = {}
    const playlist = await buildPlaylistPdf(m.header, m.songs, bp.label)
    entries['00 - Playlist.pdf'] = [playlist, { level: 0 }]
    for (const song of m.songs) {
      const f = song.files[bp.part]
      if (!f) continue
      const bytes = bytesByUrl.get(f.url)
      if (bytes) entries[f.zipName] = [bytes, { level: 0 }] // byte-identical, STORE
    }
    return entries
  }

  async function downloadOne(bp: BookPart) {
    const m = await loadManifest()
    if (!m) return
    setBuilding(bp.part)
    try {
      const bytesByUrl = await fetchFiles(m, [bp])
      setProgress('Building the book…')
      const zip = zipSync(await bookEntries(m, bp, bytesByUrl) as Parameters<typeof zipSync>[0])
      saveBlob(zip, `${normalizeForFilename(m.header.client)} - ${bp.label}.zip`)
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
      setProgress('Building the books…')
      const root: Zippable = {}
      for (const bp of m.parts) {
        root[bp.folder] = await bookEntries(m, bp, bytesByUrl)
      }
      // Instrument-agnostic printable playlist at the top level (Mac layout).
      root[`00 - ${normalizeForFilename(m.header.client)} Playlist.pdf`] = [
        await buildPlaylistPdf(m.header, m.songs, null),
        { level: 0 },
      ]
      const zip = zipSync(root as Parameters<typeof zipSync>[0])
      saveBlob(zip, `${normalizeForFilename(m.header.client)} - Books.zip`)
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
      <p className="text-xs text-muted-foreground">
        Each book is a zip: <span className="font-mono">00 - Playlist.pdf</span> plus every song as{' '}
        <span className="font-mono">NN - Title - Artist - part.pdf</span> — sort by filename and the
        performance order is the combine order.
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
