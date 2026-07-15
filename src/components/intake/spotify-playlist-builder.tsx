'use client'

/**
 * Spotify playlist builder (Book Builder) — shown on a CONFIRMED intake.
 *
 * Flow, human-gated like everything else in the pipeline:
 *   connect (once per org) → "Build Spotify playlist" → PROPOSED track per
 *   song (top search hits) → admin reviews every dropdown, skips what they
 *   want → "Create playlist" → the URL is saved onto the intake and flows to
 *   the playlist PDFs (clickable link) and the gig page.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

interface Candidate {
  uri: string
  name: string
  artists: string
  album: string
  imageUrl: string | null
  durationMs: number
}

interface Proposal {
  num: number
  title: string
  artist: string | null
  candidates: Candidate[]
}

interface Status {
  configured: boolean
  connected: boolean
  displayName: string | null
}

interface SpotifyPlaylistBuilderProps {
  projectId: string
  /** The intake's current Spotify URL (client-provided or previously built). */
  currentUrl: string | null
  onCreated: (url: string) => void
}

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function SpotifyPlaylistBuilder({ projectId, currentUrl, onCreated }: SpotifyPlaylistBuilderProps) {
  const [status, setStatus] = useState<Status | null>(null)
  const [proposals, setProposals] = useState<Proposal[] | null>(null)
  const [picks, setPicks] = useState<Record<number, string>>({}) // num -> uri | 'skip'
  const [busy, setBusy] = useState<null | 'status' | 'proposals' | 'create'>(null)

  async function loadStatus(): Promise<Status | null> {
    if (status) return status
    setBusy('status')
    try {
      const res = await fetch('/api/spotify/status')
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Could not check the Spotify connection.')
        return null
      }
      setStatus(data as Status)
      return data as Status
    } catch {
      toast.error('Could not check the Spotify connection.')
      return null
    } finally {
      setBusy(null)
    }
  }

  async function start() {
    const s = await loadStatus()
    if (!s) return
    if (!s.configured) {
      toast.error('Spotify is not configured on this server.')
      return
    }
    if (!s.connected) return // the connect button renders instead
    setBusy('proposals')
    try {
      const res = await fetch(`/api/intake/${projectId}/spotify-proposals`)
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Could not search Spotify.')
        return
      }
      const props = data.proposals as Proposal[]
      setProposals(props)
      // Default pick = top hit; no hit = skip. The admin reviews every row.
      const defaults: Record<number, string> = {}
      for (const p of props) defaults[p.num] = p.candidates[0]?.uri ?? 'skip'
      setPicks(defaults)
    } catch {
      toast.error('Could not search Spotify.')
    } finally {
      setBusy(null)
    }
  }

  async function createPlaylist() {
    if (!proposals) return
    const trackUris = proposals.map((p) => picks[p.num]).filter((u) => u && u !== 'skip')
    if (trackUris.length === 0) {
      toast.error('Every song is set to Skip — pick at least one track.')
      return
    }
    setBusy('create')
    try {
      const res = await fetch(`/api/intake/${projectId}/spotify-playlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackUris }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Could not create the playlist.')
        return
      }
      onCreated(data.url as string)
      setProposals(null)
      toast.success(
        data.saved
          ? `Playlist created with ${trackUris.length} track${trackUris.length === 1 ? '' : 's'} — the link is saved on this intake.`
          : 'Playlist created, but saving the link failed — copy it from the field below.'
      )
    } catch {
      toast.error('Could not create the playlist.')
    } finally {
      setBusy(null)
    }
  }

  const skippedCount = proposals ? proposals.filter((p) => picks[p.num] === 'skip').length : 0

  return (
    <div className="rounded-md border bg-background p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Spotify playlist</h5>
        {currentUrl && (
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary underline-offset-4 hover:underline break-all"
          >
            {currentUrl}
          </a>
        )}
      </div>

      {!proposals && (
        <div className="flex flex-wrap items-center gap-2">
          {status && status.configured && !status.connected ? (
            <>
              <Button size="sm" variant="outline" onClick={() => (window.location.href = '/api/spotify/connect')}>
                Connect Spotify
              </Button>
              <span className="text-xs text-muted-foreground">One-time — playlists are created on your account.</span>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={start} disabled={busy !== null}>
                {busy === 'proposals' ? 'Searching Spotify…' : currentUrl ? 'Rebuild playlist' : 'Build Spotify playlist'}
              </Button>
              {status?.connected && (
                <span className="text-xs text-muted-foreground">Connected as {status.displayName}</span>
              )}
              {!status && (
                <span className="text-xs text-muted-foreground">Proposes a track per song — you confirm before anything is created.</span>
              )}
            </>
          )}
        </div>
      )}

      {proposals && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Confirm the track for each song (pop songs are usually right; swap classical ones if you want a
            specific recording). Skipped songs are left off the playlist.
          </p>
          <ul className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
            {proposals.map((p) => (
              <li key={p.num} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground tabular-nums w-6 shrink-0 text-right">
                  {String(p.num).padStart(2, '0')}.
                </span>
                <span className="text-sm w-56 shrink-0 truncate" title={p.title}>
                  {p.title}
                  {p.artist && <span className="text-muted-foreground text-xs"> — {p.artist}</span>}
                </span>
                <Select
                  value={picks[p.num] ?? 'skip'}
                  onValueChange={(v) => setPicks((prev) => ({ ...prev, [p.num]: v }))}
                  disabled={busy !== null}
                >
                  <SelectTrigger className="h-8 flex-1 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {p.candidates.map((c) => (
                      <SelectItem key={c.uri} value={c.uri}>
                        {c.name} — {c.artists} ({c.album}, {fmtDuration(c.durationMs)})
                      </SelectItem>
                    ))}
                    <SelectItem value="skip">{p.candidates.length === 0 ? 'No matches — skip' : 'Skip this song'}</SelectItem>
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" onClick={createPlaylist} disabled={busy !== null}>
              {busy === 'create' ? 'Creating…' : 'Create playlist'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setProposals(null)} disabled={busy !== null}>
              Cancel
            </Button>
            {skippedCount > 0 && (
              <span className="text-xs text-muted-foreground">{skippedCount} song{skippedCount === 1 ? '' : 's'} skipped</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
