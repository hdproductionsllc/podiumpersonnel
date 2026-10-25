'use client'

import { useState } from 'react'

export function GigReportPhotoGallery({ projectId }: { projectId: string }) {
  const [photos, setPhotos] = useState<{ url: string; reportId: string }[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  async function load() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/projects/${projectId}/gig-report/photos`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not load photos.')
      setPhotos(data.photos)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not load photos. Please retry.') }
    finally { setLoading(false) }
  }
  return <div className="space-y-2 text-sm">
    <button type="button" disabled={loading} className="min-h-11 underline" onClick={() => void load()}>{loading ? 'Loading photos…' : photos ? 'Refresh gig photos' : 'View gig photos'}</button>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {photos && <><p className="text-xs text-muted-foreground">Private photos. Check publication permission before social media use. Links expire after five minutes; refresh to reopen.</p>
      {!photos.length && <p>No photos uploaded yet.</p>}
      <ul className="flex flex-wrap gap-3">{photos.map((photo, index) => <li key={photo.url}><a href={photo.url} target="_blank" rel="noopener noreferrer" className="inline-block min-h-11 rounded border px-3 py-2 underline">Photo {index + 1}</a></li>)}</ul>
    </>}
  </div>
}
