'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SupportLink } from '@/components/ui/support-link'

interface ConfirmMusicClientProps {
  token: string
  musicianFirstName: string
  organizationName: string
  projectName: string
  files: {
    name: string
    downloadUrl: string
  }[]
  alreadyConfirmed: boolean
}

export function ConfirmMusicClient({
  token,
  musicianFirstName,
  organizationName,
  projectName,
  files,
  alreadyConfirmed,
}: ConfirmMusicClientProps) {
  const [confirmed, setConfirmed] = useState(alreadyConfirmed)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/confirm-music/${token}`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to confirm')
      }

      setConfirmed(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg border overflow-hidden">
          {/* Header */}
          <div className="bg-slate-900 px-6 py-5 text-center">
            <h1 className="text-white text-lg font-semibold">{organizationName}</h1>
          </div>

          <div className="p-6 space-y-6">
            {confirmed ? (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-green-800">Music receipt confirmed!</h2>
                <p className="text-slate-600">
                  Thanks, {musicianFirstName}! You're all set for <strong>{projectName}</strong>.
                </p>
              </div>
            ) : (
              <>
                <div className="text-center">
                  <h2 className="text-lg font-semibold text-slate-900">
                    Hi {musicianFirstName}!
                  </h2>
                  <p className="text-sm text-slate-600 mt-1">
                    Please confirm you've received your music for this project.
                  </p>
                </div>

                <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                  <h3 className="font-semibold text-slate-900">{projectName}</h3>
                  <p className="text-sm text-slate-500 font-medium">Your files:</p>
                  {files.map((file, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <svg className="h-4 w-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                      </svg>
                      <a
                        href={file.downloadUrl}
                        className="text-blue-600 hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {file.name}
                      </a>
                    </div>
                  ))}
                </div>

                {error && (
                  <div className="text-center text-sm">
                    <p className="text-red-600">{error}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Having trouble? Email <SupportLink subject="Help confirming music" />
                    </p>
                  </div>
                )}

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleConfirm}
                  disabled={loading}
                >
                  {loading ? 'Confirming...' : "I've Received All Music — Confirm"}
                </Button>

                <p className="text-xs text-slate-400 text-center">
                  Need to download files first? Click the file names above.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
