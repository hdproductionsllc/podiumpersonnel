'use client'

import Link from 'next/link'
import { format, formatDistanceToNow, isPast } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Clock, MapPin, Music2, Calendar, AlertCircle, ChevronRight } from 'lucide-react'
import { cn, DEFAULT_TIMEZONE } from '@/lib/utils'

interface OfferCardProps {
  offer: {
    id: string
    token: string
    status: string
    expires_at: string | null
    musician: {
      organization: {
        id: string
        name: string
        timezone: string | null
      }
    }
    project_position: {
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
  }
  variant?: 'compact' | 'full'
}

export function OfferCard({ offer, variant = 'full' }: OfferCardProps) {
  const position = offer.project_position
  const project = position?.project
  const organization = offer.musician?.organization
  const timezone = organization?.timezone || DEFAULT_TIMEZONE

  const isExpiringSoon = offer.expires_at &&
    new Date(offer.expires_at) < new Date(Date.now() + 24 * 60 * 60 * 1000) &&
    !isPast(new Date(offer.expires_at))

  const isExpired = offer.expires_at && isPast(new Date(offer.expires_at))

  const formatProjectDates = () => {
    if (!project?.start_date) return null
    const startDate = toZonedTime(new Date(project.start_date), timezone)
    if (project.end_date && project.start_date !== project.end_date) {
      const endDate = toZonedTime(new Date(project.end_date), timezone)
      return `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`
    }
    return format(startDate, 'MMMM d, yyyy')
  }

  if (variant === 'compact') {
    return (
      <Link href={`/musician/offers/${offer.id}`}>
        <Card className={cn(
          'transition-colors hover:bg-muted/50',
          isExpiringSoon && 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20',
          isExpired && 'border-destructive/50 opacity-75'
        )}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium truncate">{project?.name}</p>
                  {isExpiringSoon && (
                    <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 shrink-0">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Expiring soon
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">{organization?.name}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Music2 className="h-3 w-3" />
                    {position?.instrument?.name}
                  </span>
                  {project?.start_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatProjectDates()}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
            </div>
          </CardContent>
        </Card>
      </Link>
    )
  }

  return (
    <Card className={cn(
      'overflow-hidden',
      isExpiringSoon && 'border-amber-500',
      isExpired && 'border-destructive/50 opacity-75'
    )}>
      {isExpiringSoon && (
        <div className="bg-amber-100 dark:bg-amber-900 px-4 py-2 text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span>
            Expires {offer.expires_at && formatDistanceToNow(new Date(offer.expires_at), { addSuffix: true })}
          </span>
        </div>
      )}
      <CardContent className="p-4">
        <div className="space-y-3">
          <div>
            <p className="text-sm text-muted-foreground">{organization?.name}</p>
            <h3 className="font-semibold text-lg">{project?.name}</h3>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="flex items-center gap-1">
              <Music2 className="h-3 w-3" />
              {position?.instrument?.name}
              {position?.chair_number > 1 && ` - Chair ${position.chair_number}`}
            </Badge>
          </div>

          {project?.start_date && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{formatProjectDates()}</span>
            </div>
          )}

          {offer.expires_at && !isExpired && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>
                Respond by {format(new Date(offer.expires_at), 'MMMM d, yyyy')}
              </span>
            </div>
          )}

          <div className="pt-2">
            <Link href={`/musician/offers/${offer.id}`}>
              <Button className="w-full">View Offer</Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
