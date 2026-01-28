'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, formatDistanceToNow, isPast } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertCircle,
  Calendar,
  Check,
  Clock,
  DollarSign,
  MapPin,
  Music2,
  X,
  Building,
} from 'lucide-react'
import { cn, DEFAULT_TIMEZONE } from '@/lib/utils'

interface OfferDetailProps {
  offer: {
    id: string
    token: string
    status: string
    custom_pay: number | null
    expires_at: string | null
    musician: {
      id: string
      first_name: string
      last_name: string
      email: string | null
      organization: {
        id: string
        name: string
        timezone: string | null
        email_logo_url: string | null
        email_brand_color: string | null
        musician_policy: string | null
      }
    }
    project_position: {
      id: string
      chair_number: number
      instrument: {
        id: string
        name: string
      }
      project: {
        id: string
        name: string
        description: string | null
        start_date: string | null
        end_date: string | null
      }
    }
  }
  services: {
    id: string
    name: string
    service_type: string
    start_time: string
    end_time: string | null
    venue: string | null
    base_pay: number | null
    venue_info?: {
      name: string
      address: string | null
      city: string | null
      state: string | null
      google_maps_url: string | null
    } | null
  }[]
  totalPay: number | null
  totalChairs: number
}

export function OfferDetail({ offer, services, totalPay, totalChairs }: OfferDetailProps) {
  const router = useRouter()
  const [isAccepting, setIsAccepting] = useState(false)
  const [isDeclining, setIsDeclining] = useState(false)
  const [showDeclineDialog, setShowDeclineDialog] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const organization = offer.musician?.organization
  const position = offer.project_position
  const project = position?.project
  const timezone = organization?.timezone || DEFAULT_TIMEZONE

  const canRespond = offer.status === 'pending' || offer.status === 'viewed'
  const isExpired = offer.expires_at && isPast(new Date(offer.expires_at))
  const isExpiringSoon = offer.expires_at &&
    new Date(offer.expires_at) < new Date(Date.now() + 24 * 60 * 60 * 1000) &&
    !isExpired

  const showChair = totalChairs > 1

  async function handleAccept() {
    setIsAccepting(true)
    setError(null)

    try {
      const response = await fetch(`/api/musician/offers/${offer.id}/accept`, {
        method: 'POST',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to accept offer')
      }

      router.push('/musician/offers?status=history&message=accepted')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept offer')
      setIsAccepting(false)
    }
  }

  async function handleDecline() {
    setIsDeclining(true)
    setError(null)

    try {
      const response = await fetch(`/api/musician/offers/${offer.id}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: declineReason || null }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to decline offer')
      }

      setShowDeclineDialog(false)
      router.push('/musician/offers?status=history&message=declined')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decline offer')
      setIsDeclining(false)
    }
  }

  const statusBadge = () => {
    switch (offer.status) {
      case 'accepted':
        return <Badge className="bg-green-100 text-green-700 border-green-300">Accepted</Badge>
      case 'declined':
        return <Badge variant="destructive">Declined</Badge>
      case 'expired':
        return <Badge variant="secondary">Expired</Badge>
      default:
        return <Badge variant="outline">Pending Response</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Building className="h-4 w-4" />
          <span>{organization?.name}</span>
        </div>
        <h1 className="text-2xl font-bold">{project?.name}</h1>
        <div className="flex items-center gap-2">
          {statusBadge()}
          {isExpiringSoon && canRespond && (
            <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300">
              <AlertCircle className="h-3 w-3 mr-1" />
              Expires {formatDistanceToNow(new Date(offer.expires_at!), { addSuffix: true })}
            </Badge>
          )}
          {isExpired && canRespond && (
            <Badge variant="destructive">Expired</Badge>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Position Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Your Position</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="flex items-center gap-1">
              <Music2 className="h-3 w-3" />
              {position?.instrument?.name}
              {showChair && `, Chair ${position?.chair_number}`}
            </Badge>
            {totalPay !== null && totalPay > 0 && (
              <Badge variant="outline" className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                ${totalPay.toLocaleString()}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Project Description */}
      {project?.description && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">About</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Services */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Services ({services.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {services.map((service, index) => {
            const startTime = toZonedTime(new Date(service.start_time), timezone)
            const endTime = service.end_time ? toZonedTime(new Date(service.end_time), timezone) : null
            const venueName = service.venue_info?.name || service.venue
            const venueAddress = service.venue_info
              ? [service.venue_info.address, service.venue_info.city, service.venue_info.state]
                  .filter(Boolean)
                  .join(', ')
              : null
            const mapsUrl = service.venue_info?.google_maps_url

            return (
              <div
                key={service.id}
                className={cn(
                  'rounded-lg border p-4',
                  index === 0 && 'border-primary bg-primary/5'
                )}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">{service.name}</h4>
                    <Badge variant="secondary" className="text-xs">{service.service_type}</Badge>
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 shrink-0" />
                      <span>{format(startTime, 'EEEE, MMMM d, yyyy')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 shrink-0" />
                      <span>
                        {format(startTime, 'h:mm a')}
                        {endTime && ` - ${format(endTime, 'h:mm a')}`}
                      </span>
                    </div>
                    {venueName && (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                        <div>
                          {mapsUrl ? (
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              {venueName}
                            </a>
                          ) : (
                            <span>{venueName}</span>
                          )}
                          {venueAddress && (
                            <p className="text-xs">{venueAddress}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Response Deadline */}
      {offer.expires_at && canRespond && (
        <Card className={cn(isExpiringSoon && 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20')}>
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-sm">
              <Clock className={cn('h-4 w-4', isExpiringSoon && 'text-amber-600')} />
              <span>
                Please respond by{' '}
                <strong>{format(new Date(offer.expires_at), 'MMMM d, yyyy')}</strong>
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      {canRespond && !isExpired && (
        <div className="fixed bottom-20 md:bottom-0 left-0 right-0 md:left-60 p-4 bg-background border-t md:sticky md:border-0 md:bg-transparent md:p-0">
          <div className="flex gap-3 max-w-4xl mx-auto">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowDeclineDialog(true)}
              disabled={isAccepting || isDeclining}
            >
              <X className="h-4 w-4 mr-2" />
              Decline
            </Button>
            <Button
              className="flex-1"
              onClick={handleAccept}
              disabled={isAccepting || isDeclining}
            >
              {isAccepting ? (
                'Accepting...'
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Accept
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Already Responded Message */}
      {!canRespond && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground text-center">
              You have already {offer.status} this offer.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Decline Dialog */}
      <Dialog open={showDeclineDialog} onOpenChange={setShowDeclineDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Offer</DialogTitle>
            <DialogDescription>
              Are you sure you want to decline this offer for {project?.name}?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Reason (optional)</label>
              <Textarea
                placeholder="Let the organization know why you're declining..."
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeclineDialog(false)}
              disabled={isDeclining}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDecline}
              disabled={isDeclining}
            >
              {isDeclining ? 'Declining...' : 'Decline Offer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
