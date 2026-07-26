'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { SupportLink } from '@/components/ui/support-link'

const MAX_BYTES = 5 * 1024 * 1024
const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png']

interface W9UploadClientProps {
  token: string
  musicianFirstName: string
  organizationName: string
  isExpired: boolean
}

/**
 * W-9 submission for a musician with no account. Mirrors the other public token
 * pages: one job, one button, readable on a phone.
 *
 * Type and size are checked here for instant feedback, but the route re-checks
 * both — this is convenience, not the gate.
 */
export function W9UploadClient({
  token,
  musicianFirstName,
  organizationName,
  isExpired,
}: W9UploadClientProps) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleChoose(selected: File | null) {
    setError(null)

    if (!selected) {
      setFile(null)
      return
    }

    if (!ACCEPTED.includes(selected.type)) {
      setFile(null)
      setError('Please choose a PDF, JPG, or PNG file.')
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    if (selected.size > MAX_BYTES) {
      setFile(null)
      setError('That file is larger than 5MB. Try saving it at a smaller size.')
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setFile(selected)
  }

  async function handleSubmit() {
    if (!file || uploading) return

    setUploading(true)
    setError(null)

    try {
      const body = new FormData()
      body.append('file', file)

      const res = await fetch(`/api/w9/${token}`, { method: 'POST', body })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data.error || 'We could not upload that file.')
      }

      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg border overflow-hidden">
          <div className="bg-slate-900 px-6 py-5 text-center">
            <h1 className="text-white text-lg font-semibold">{organizationName}</h1>
          </div>

          <div className="px-6 py-6 space-y-5">
            {done ? (
              <div className="text-center space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                  <svg
                    className="h-6 w-6 text-green-700"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-slate-900">W-9 received</h2>
                <p className="text-sm text-slate-600">
                  Thanks, {musicianFirstName}. {organizationName} has your form and nothing
                  else is needed from you. You can close this page.
                </p>
              </div>
            ) : isExpired ? (
              <div className="space-y-3 text-center">
                <h2 className="text-lg font-semibold text-slate-900">This link has expired</h2>
                <p className="text-sm text-slate-600">
                  Ask {organizationName} to send a new W-9 request — it only takes them a
                  moment, and the new link will work right away.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold text-slate-900">
                    Hi {musicianFirstName} — please send your W-9
                  </h2>
                  <p className="text-sm text-slate-600">
                    {organizationName} needs a completed W-9 on file to pay you. Upload it
                    here and you are done — no account or password required.
                  </p>
                </div>

                <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-sm text-slate-600">
                  Don&apos;t have one filled out yet? Download the blank form from the{' '}
                  <a
                    href="https://www.irs.gov/forms-pubs/about-form-w-9"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-900 underline underline-offset-2"
                  >
                    IRS website
                  </a>
                  , complete and sign it, then come back here.
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="w9-file"
                    className="block text-sm font-medium text-slate-900"
                  >
                    Your completed W-9
                  </label>
                  <input
                    ref={inputRef}
                    id="w9-file"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    disabled={uploading}
                    onChange={(e) => handleChoose(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700 disabled:opacity-50"
                  />
                  <p className="text-xs text-slate-500">PDF, JPG, or PNG. Up to 5MB.</p>
                </div>

                {error && (
                  <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
                    {error}
                  </div>
                )}

                <Button
                  onClick={handleSubmit}
                  disabled={!file || uploading}
                  className="w-full"
                >
                  {uploading ? 'Sending…' : 'Send my W-9'}
                </Button>

                <p className="text-xs text-slate-500 text-center">
                  Your W-9 is stored privately and is only visible to {organizationName}.
                </p>
              </>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          Questions? Email <SupportLink subject="Help submitting my W-9" />
        </p>
      </div>
    </div>
  )
}
