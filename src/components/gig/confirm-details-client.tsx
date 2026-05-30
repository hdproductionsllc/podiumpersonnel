'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SupportLink } from '@/components/ui/support-link'

interface ConfirmDetailsClientProps {
  token: string
  musicianFirstName: string
  organizationName: string
  projectName: string
  ensembleType: string | null
  services: {
    name: string
    date: string
    venue: string | null
  }[]
  alreadyConfirmed: boolean
  confirmedAt: string | null
  timezone: string
}

export function ConfirmDetailsClient({
  token,
  musicianFirstName,
  organizationName,
  projectName,
  ensembleType,
  services,
  alreadyConfirmed,
  confirmedAt,
  timezone,
}: ConfirmDetailsClientProps) {
  const [confirmed, setConfirmed] = useState(alreadyConfirmed)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/confirm-details/${token}`, {
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
              /* Success State */
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-green-800">You're all set!</h2>
                <p className="text-slate-600">
                  {musicianFirstName} — confirmed for <strong>{projectName}</strong>.
                </p>
                <p className="text-sm text-slate-500">See you there!</p>
              </div>
            ) : (
              /* Confirm State */
              <>
                <div className="text-center">
                  <h2 className="text-lg font-semibold text-slate-900">
                    Hi {musicianFirstName}!
                  </h2>
                  <p className="text-sm text-slate-600 mt-1">
                    Please confirm you've reviewed the gig details.
                  </p>
                </div>

                <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                  <h3 className="font-semibold text-slate-900">{projectName}</h3>
                  {ensembleType && (
                    <p className="text-sm text-slate-600">{ensembleType}</p>
                  )}
                  {services.map((service, i) => (
                    <div key={i} className="text-sm border-l-2 border-slate-300 pl-3">
                      <p className="font-medium text-slate-800">{service.name}</p>
                      <p className="text-slate-600">{service.date}</p>
                      {service.venue && (
                        <p className="text-slate-500">{service.venue}</p>
                      )}
                    </div>
                  ))}
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800 space-y-1">
                  <p className="font-semibold">By confirming, you acknowledge:</p>
                  <p>✓ Date, time, and location</p>
                  <p>✓ Parking and access instructions</p>
                  <p>✓ Ensemble roster and contact info</p>
                </div>

                {error && (
                  <div className="text-center text-sm">
                    <p className="text-red-600">{error}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Having trouble? Email <SupportLink subject="Help confirming gig details" />
                    </p>
                  </div>
                )}

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleConfirm}
                  disabled={loading}
                >
                  {loading ? 'Confirming...' : "I've Read All Details — Confirm"}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
