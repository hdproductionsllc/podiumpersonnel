'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface Service {
  id: string
  name: string
  start_time: string
}

interface Instrument {
  id: string
  name: string
}

interface SubRequestFormProps {
  token: string
  services: Service[]
  instruments: Instrument[]
  currentInstrumentId: string
  onSuccess: () => void
  onCancel: () => void
}

export function SubRequestForm({
  token,
  services,
  instruments,
  currentInstrumentId,
  onSuccess,
  onCancel,
}: SubRequestFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    serviceId: '',
    reason: '',
    subFirstName: '',
    subLastName: '',
    subEmail: '',
    subPhone: '',
    subInstrumentId: currentInstrumentId,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const response = await fetch(`/api/gig/${token}/request-sub`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit sub request')
      }

      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="serviceId" className="text-sm">Which service do you need a sub for?</Label>
        <select
          id="serviceId"
          className="w-full rounded-md border border-input bg-background px-3 py-2.5 sm:py-2 text-sm"
          value={formData.serviceId}
          onChange={(e) => setFormData({ ...formData, serviceId: e.target.value })}
        >
          <option value="">All services</option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name} - {new Date(service.start_time).toLocaleDateString()}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="reason">Reason for needing a sub</Label>
        <Textarea
          id="reason"
          placeholder="Please briefly explain why you need a substitute..."
          value={formData.reason}
          onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
          rows={3}
        />
      </div>

      <div className="border-t pt-4 mt-4">
        <h4 className="font-medium mb-3">Suggested Substitute</h4>
        <p className="text-sm text-muted-foreground mb-4">
          Please provide the contact information for your suggested substitute.
          They will receive a contract offer if your request is approved.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="subFirstName">First Name *</Label>
            <Input
              id="subFirstName"
              required
              value={formData.subFirstName}
              onChange={(e) => setFormData({ ...formData, subFirstName: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="subLastName">Last Name *</Label>
            <Input
              id="subLastName"
              required
              value={formData.subLastName}
              onChange={(e) => setFormData({ ...formData, subLastName: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2 mt-4">
          <Label htmlFor="subEmail">Email *</Label>
          <Input
            id="subEmail"
            type="email"
            required
            value={formData.subEmail}
            onChange={(e) => setFormData({ ...formData, subEmail: e.target.value })}
          />
        </div>

        <div className="space-y-2 mt-4">
          <Label htmlFor="subPhone">Phone</Label>
          <Input
            id="subPhone"
            type="tel"
            value={formData.subPhone}
            onChange={(e) => setFormData({ ...formData, subPhone: e.target.value })}
          />
        </div>

        <div className="space-y-2 mt-4">
          <Label htmlFor="subInstrumentId" className="text-sm">Instrument *</Label>
          <select
            id="subInstrumentId"
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 sm:py-2 text-sm"
            value={formData.subInstrumentId}
            onChange={(e) => setFormData({ ...formData, subInstrumentId: e.target.value })}
          >
            {instruments.map((instrument) => (
              <option key={instrument.id} value={instrument.id}>
                {instrument.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950 p-3 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting} className="sm:flex-none h-11 sm:h-10">
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting} className="flex-1 h-12 sm:h-10 text-base sm:text-sm font-semibold">
          {isSubmitting ? 'Submitting...' : 'Submit Request'}
        </Button>
      </div>
    </form>
  )
}
