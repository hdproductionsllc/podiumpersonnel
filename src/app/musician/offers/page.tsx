'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { OfferCard } from '@/components/musician/offer-card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Mail, CheckCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type TabType = 'pending' | 'history'

export default function MusicianOffersPage() {
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabType>('pending')
  const [offers, setOffers] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    // Handle URL params
    const status = searchParams.get('status')
    const message = searchParams.get('message')

    if (status === 'history') {
      setActiveTab('history')
    }

    if (message === 'accepted') {
      setSuccessMessage('Offer accepted successfully!')
    } else if (message === 'declined') {
      setSuccessMessage('Offer declined.')
    }

    // Clear message after 5 seconds
    if (message) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [searchParams])

  useEffect(() => {
    async function fetchOffers() {
      setIsLoading(true)
      try {
        const impersonateId = searchParams.get('impersonate')
        const params = new URLSearchParams({ status: activeTab })
        if (impersonateId) params.set('impersonate', impersonateId)
        const response = await fetch(`/api/musician/offers?${params}`)
        if (response.ok) {
          const data = await response.json()
          setOffers(data.offers || [])
        }
      } catch (error) {
        console.error('Failed to fetch offers:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchOffers()
  }, [activeTab, searchParams])

  const pendingCount = activeTab === 'pending' ? offers.length : 0

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Offers</h1>

      {successMessage && (
        <div className={cn(
          'rounded-md p-3 text-sm flex items-center gap-2',
          successMessage.includes('accepted')
            ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200'
            : 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200'
        )}>
          {successMessage.includes('accepted') ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          {successMessage}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('pending')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'pending'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          Pending
          {pendingCount > 0 && (
            <span className="ml-2 rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-xs">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'history'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          History
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : offers.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Mail className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-medium">
            {activeTab === 'pending' ? 'No pending offers' : 'No offer history'}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {activeTab === 'pending'
              ? 'When you receive new offers, they will appear here.'
              : 'Your accepted and declined offers will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {offers.map((offer) => (
            <OfferCard key={offer.id} offer={offer} variant="compact" />
          ))}
        </div>
      )}
    </div>
  )
}
