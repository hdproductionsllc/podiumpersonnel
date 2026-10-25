'use client'

import { useEffect, useRef, useState } from 'react'
import { MAX_PHOTOS } from '@/lib/after-gig/photos'

import { preparePhoto } from '@/lib/after-gig/prepare-photo'

type Upload = { id: string; file: File; progress: number; status: 'queued' | 'preparing' | 'uploading' | 'saved' | 'error'; error?: string; retryable?: boolean }

export function GigReportPhotos({ token }: { token: string }) {
  const [uploads, setUploads] = useState<Upload[]>([])
  const [notice, setNotice] = useState('')
  const busy = useRef(false)
  const pending = uploads.some(upload => ['queued', 'preparing', 'uploading'].includes(upload.status))
  useEffect(() => {
    if (!pending) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [pending])

  function change(id: string, update: Partial<Upload>) {
    setUploads(previous => previous.map(upload => upload.id === id ? { ...upload, ...update } : upload))
  }
  async function send(items: Upload[]) {
    if (busy.current) return
    busy.current = true
    try {
      for (const item of items) {
        change(item.id, { status: 'preparing', progress: 0, error: undefined })
        let retryable = false
        try {
          const blob = await preparePhoto(item.file)
          retryable = true
          change(item.id, { status: 'uploading' })
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest()
            xhr.open('POST', `/api/report/${token}/photos`)
            xhr.timeout = 90000
            xhr.upload.onprogress = event => { if (event.lengthComputable) change(item.id, { progress: Math.round(event.loaded / event.total * 100) }) }
            xhr.onerror = () => reject(new Error('Connection lost. Retry this photo.'))
            xhr.ontimeout = () => reject(new Error('Upload timed out. Retry this photo.'))
            xhr.onload = () => {
              let data: { success?: boolean; error?: string } = {}
              try { data = JSON.parse(xhr.responseText) } catch { /* Unexpected gateway response. */ }
              if (xhr.status >= 200 && xhr.status < 300 && data.success) resolve()
              else reject(new Error(data.error || 'Photo was not saved. Please retry.'))
            }
            const body = new FormData()
            body.append('photo', blob, 'gig-photo.jpg')
            xhr.send(body)
          })
          change(item.id, { status: 'saved', progress: 100 })
        } catch (error) {
          change(item.id, { status: 'error', retryable, error: error instanceof Error ? error.message : 'Could not upload. Please retry.' })
        }
      }
    } finally { busy.current = false }
  }

  return (
    <section className="border-t pt-5 space-y-3" aria-labelledby="photos-heading">
      <h2 id="photos-heading" className="font-semibold">Gig photos (optional)</h2>
      <p className="text-sm text-slate-600">Add up to 10 photos at a time for the team. JPEG, PNG or WebP, up to 20 MB each; large images are resized. Photos upload separately, so you can send your report anytime.</p>
      <p className="text-xs text-slate-500">Private to the organization&apos;s owners and admins. Uploading does not give permission to publish identifiable people. The team must check permission before any social media use.</p>
      <details className="text-sm text-slate-600">
        <summary className="min-h-11 cursor-pointer py-2 underline">iPhone photo help</summary>
        <p>HEIC/HEIF originals are not supported yet. For a new JPEG, open Settings &gt; Camera &gt; Formats &gt; Most Compatible, then take a new photo and choose it below. This setting only changes new photos.</p>
        <p className="mt-2">For an existing photo on iOS 26 or later: save it to Files, open it in Preview, tap the menu beside its filename, then Export, JPEG, Done and Save. Choose the saved JPEG here. You can also skip photos and send your report.</p>
        <a className="block min-h-11 py-2 underline" href="https://support.apple.com/guide/iphone/export-or-compress-pdfs-and-images-iph61c20afe1/ios" target="_blank" rel="noopener noreferrer">Apple’s JPEG export instructions</a>
        <a className="inline-block min-h-11 py-2 underline" href="https://support.apple.com/en-us/116944" target="_blank" rel="noopener noreferrer">Apple’s photo-format instructions</a>
      </details>
      <label className="block text-sm font-medium" htmlFor="gig-photos">Choose photos</label>
      <input id="gig-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={pending} className="block w-full text-sm file:min-h-11 file:mr-3 file:rounded file:border file:px-3" onChange={event => {
        const files = Array.from(event.target.files || [])
        event.target.value = ''
        if (!files.length) return
        if (files.length > MAX_PHOTOS) { setNotice('Choose up to 10 photos at a time.'); return }
        setNotice('')
        const added: Upload[] = files.map(file => ({ id: crypto.randomUUID(), file, progress: 0, status: 'queued' }))
        setUploads(previous => [...previous, ...added])
        void send(added)
      }} />
      {notice && <p role="alert" className="text-sm text-red-700">{notice}</p>}
      <ul className="space-y-3">
        {uploads.map(upload => <li key={upload.id} className="rounded border p-3 text-sm space-y-1">
          <p className="break-all">{upload.file.name}</p>
          <p role="status">{upload.status === 'saved' ? 'Saved to this gig' : upload.status === 'preparing' ? 'Preparing photo…' : upload.status === 'uploading' ? upload.progress === 100 ? 'Saving photo…' : `Uploading ${upload.progress}%` : upload.status === 'queued' ? 'Waiting…' : 'Not saved'}</p>
          {upload.status === 'uploading' && <progress className="w-full" value={upload.progress} max={100} aria-label={`Uploading ${upload.file.name}`} />}
          {upload.status === 'error' && <><p role="alert" className="text-red-700">{upload.error} You can still send your report.</p>{upload.retryable && <button type="button" disabled={pending} className="min-h-11 underline mr-4" onClick={() => void send([upload])}>Retry photo</button>}<button type="button" disabled={pending} className="min-h-11 underline" onClick={() => setUploads(previous => previous.filter(item => item.id !== upload.id))}>Remove from list</button></>}
        </li>)}
      </ul>
      {pending && <p className="text-xs text-slate-500">Keep this page open until the photos finish saving.</p>}
    </section>
  )
}
