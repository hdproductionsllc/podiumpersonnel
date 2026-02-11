'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, formatDistanceToNow, isPast } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
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
  ChevronDown,
  Clock,
  DollarSign,
  ExternalLink,
  Music2,
  X,
} from 'lucide-react'
import { cn, DEFAULT_TIMEZONE } from '@/lib/utils'

export interface InlineOfferData {
  id: string
  token: string
  status: string
  custom_pay: number | null
  expires_at: string | null
  musician: {
    id: string
    organization: {
      id: string
      name: string
      timezone: string | null
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
      start_date: string | null
      end_date: string | null
    }
  }
  services?: {
    id: string
    name: string
    service_type: string
    start_time: string
    end_time: string | null
    venue: string | null
    base_pay: number | null
    venue_info?: {
      name: string
    } | null
  }[]
  totalPay?: number | null
  totalChairs?: number
}

interface InlineOfferCardProps {
  offer: InlineOfferData
  defaultOpen?: boolean
  onResponded?: () => void
}

export function InlineOfferCard({ offer, defaultOpen = false, onResponded }: InlineOfferCardProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [isAccepting, setIsAccepting] = useState(false)
  const [isDeclining, setIsDeclining] = useState(false)
  const [showDeclineDialog, setShowDeclineDialog] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [responded, setResponded] = useState(false)

  const position = offer.project_position
  const project = position?.project
  const organization = offer.musician?.organization
  const timezone = organization?.timezone || DEFAULT_TIMEZONE
  const services = offer.services || []
  const showChair = (offer.totalChairs || 1) > 1

  const isExpired = offer.expires_at && isPast(new Date(offer.expires_at))
  const isExpiringSoon = offer.expires_at &&
    new Date(offer.expires_at) < new Date(Date.now() + 48 * 60 * 60 * 1000) &&
    !isExpired

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
      setResponded(true)
      router.refresh()
      onResponded?.()
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
      setResponded(true)
      router.refresh()
      onResponded?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decline offer')
      setIsDeclining(false)
    }
  }

  if (responded) {
    return (
      <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/20 dark:border-green-800">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
            <Check className="h-4 w-4" />
            <span className="text-sm font-medium">
              Offer {isAccepting ? 'accepted' : 'declined'}. Refreshing...
            </span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card className={cn(
          'transition-colors',
          isExpiringSoon && 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20',
          isExpired && 'border-destructive/50 opacity-75',
        )}>
          <CollapsibleTrigger className="w-full text-left">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{project?.name}</p>
                    {isExpiringSoon && (
                      <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 text-[10px]">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        {offer.expires_at && formatDistanceToNow(new Date(offer.expires_at), { addSuffix: true })}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{organization?.name}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant="secondary" className="text-xs">
                      <Music2 className="h-3 w-3 mr-1" />
                      {position?.instrument?.name}
                      {showChair && ` ${position?.chair_number}`}
                    </Badge>
                    {offer.totalPay != null && offer.totalPay > 0 && (
                      <Badge variant="outline" className="text-xs">
                        <DollarSign className="h-3 w-3 mr-0.5" />
                        ${offer.totalPay.toLocaleString()}
                      </Badge>
                    )}
                  </div>
                </div>
                <ChevronDown
                  className={cn(
                    'h-5 w-5 text-muted-foreground transition-transform shrink-0 mt-1',
                    isOpen && 'rotate-180'
                  )}
                />
              </div>
            </CardContent>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="px-4 pb-4 space-y-3 border-t pt-3">
              {error && (
                <div className="rounded-md bg-destructive/15 p-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              {/* Service list */}
              {services.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Services ({services.length})
                  </p>
                  {services.map((service) => {
                    const start = toZonedTime(new Date(service.start_time), timezone)
                    const venueName = service.venue_info?.name || service.venue
                    return (
                      <div key={service.id} className="flex items-center gap-2 text-sm py-1">
                        <span className="text-xs text-muted-foreground w-20 shrink-0">
                          {format(start, 'EEE MMM d')}
                        </span>
                        <span className="text-xs text-muted-foreground w-14 shrink-0">
                          {format(start, 'h:mm a')}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {service.service_type}
                        </Badge>
                        {venueName && (
                          <span className="text-xs text-muted-foreground truncate ml-auto">
                            {venueName}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Expiration */}
              {offer.expires_at && !isExpired && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Respond by {format(new Date(offer.expires_at), 'MMMM d, yyyy')}
                </div>
              )}

              {/* Action buttons */}
              {!isExpired && (
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowDeclineDialog(true)
                    }}
                    disabled={isAccepting || isDeclining}
                  >
                    <X className="h-3.5 w-3.5 mr-1" />
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleAccept()
                    }}
                    disabled={isAccepting || isDeclining}
                  >
                    {isAccepting ? 'Accepting...' : (
                      <>
                        <Check className="h-3.5 w-3.5 mr-1" />
                        Accept
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* View Full Details link */}
              <div className="flex justify-center">
                <a
                  href={`/musician/offers/${offer.id}`}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  View Full Details
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Decline Dialog */}
      <Dialog open={showDeclineDialog} onOpenChange={setShowDeclineDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Offer</DialogTitle>
            <DialogDescription>
              Are you sure you want to decline this offer for {project?.name}?
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-sm font-medium">Reason (optional)</label>
            <Textarea
              placeholder="Let the organization know why you're declining..."
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              className="mt-1.5"
            />
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
    </>
  )
}
