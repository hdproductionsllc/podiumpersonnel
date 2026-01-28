'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { OfferCard } from './offer-card'
import { ServiceCard } from './service-card'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertCircle, Calendar, Mail } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface DashboardData {
  musician: {
    id: string
    first_name: string
    last_name: string
    email: string | null
  }
  organizations: {
    id: string
    name: string
    musicianId: string
  }[]
  pendingOffers: any[]
  upcomingServices: any[]
}

interface DashboardClientProps {
  initialData: DashboardData
}

export function DashboardClient({ initialData }: DashboardClientProps) {
  const [data, setData] = useState<DashboardData>(initialData)
  const [isLoading, setIsLoading] = useState(false)
  const searchParams = useSearchParams()
  const impersonateId = searchParams.get('impersonate')

  // Refresh data periodically
  useEffect(() => {
    async function refreshData() {
      const params = impersonateId ? `?impersonate=${impersonateId}` : ''
      const response = await fetch(`/api/musician/dashboard${params}`)
      if (response.ok) {
        const newData = await response.json()
        setData(newData)
      }
    }

    // Refresh every 5 minutes
    const interval = setInterval(refreshData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [impersonateId])

  const { musician, pendingOffers, upcomingServices } = data

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold">Hi, {musician.first_name}!</h1>
        <p className="text-muted-foreground">
          Welcome to your musician portal
        </p>
      </div>

      {/* Action Required - Pending Offers */}
      {pendingOffers.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="rounded-full bg-amber-100 dark:bg-amber-900 p-1.5">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="font-semibold text-lg">Action Required</h2>
            <span className="text-sm text-muted-foreground">
              ({pendingOffers.length} pending {pendingOffers.length === 1 ? 'offer' : 'offers'})
            </span>
          </div>
          <div className="space-y-3">
            {pendingOffers.slice(0, 3).map((offer) => (
              <OfferCard key={offer.id} offer={offer} variant="compact" />
            ))}
            {pendingOffers.length > 3 && (
              <Link href="/musician/offers">
                <Button variant="outline" className="w-full">
                  View all {pendingOffers.length} offers
                </Button>
              </Link>
            )}
          </div>
        </section>
      )}

      {/* Empty state for offers */}
      {pendingOffers.length === 0 && (
        <section className="rounded-lg border border-dashed p-6 text-center">
          <Mail className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <h3 className="font-medium">No pending offers</h3>
          <p className="text-sm text-muted-foreground">
            You&apos;re all caught up! New offers will appear here.
          </p>
        </section>
      )}

      {/* Upcoming Services */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-primary/10 p-1.5">
              <Calendar className="h-4 w-4 text-primary" />
            </div>
            <h2 className="font-semibold text-lg">Upcoming</h2>
          </div>
          {upcomingServices.length > 0 && (
            <Link
              href="/musician/schedule"
              className="text-sm text-primary hover:underline"
            >
              View all
            </Link>
          )}
        </div>

        {upcomingServices.length > 0 ? (
          <div className="space-y-3">
            {upcomingServices.slice(0, 5).map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                showProject={true}
                variant="compact"
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <Calendar className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <h3 className="font-medium">No upcoming services</h3>
            <p className="text-sm text-muted-foreground">
              Your confirmed gigs will appear here.
            </p>
          </div>
        )}
      </section>

      {/* Connected Organizations */}
      {data.organizations.length > 1 && (
        <section>
          <h2 className="font-semibold text-lg mb-4">Your Organizations</h2>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
            {data.organizations.map((org) => (
              <div
                key={org.id}
                className="rounded-lg border p-3 text-center"
              >
                <p className="font-medium text-sm truncate">{org.name}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64 mt-2" />
      </div>

      <section>
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </section>
    </div>
  )
}
