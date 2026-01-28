'use client'

import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, Clock, MapPin, Music2 } from 'lucide-react'
import { cn, DEFAULT_TIMEZONE } from '@/lib/utils'

interface ServiceCardProps {
  service: {
    id: string
    name: string
    service_type: string
    start_time: string
    end_time: string | null
    venue: string | null
    venue_info?: {
      name: string
      address: string | null
      city: string | null
      state: string | null
    } | null
    project?: {
      id: string
      name: string
      organization?: {
        id: string
        name: string
        timezone: string | null
      } | null
    } | null
    instrument?: {
      id: string
      name: string
    } | null
    chair_number?: number
  }
  showProject?: boolean
  variant?: 'compact' | 'full'
}

export function ServiceCard({ service, showProject = true, variant = 'full' }: ServiceCardProps) {
  const timezone = service.project?.organization?.timezone || DEFAULT_TIMEZONE
  const startTime = toZonedTime(new Date(service.start_time), timezone)
  const endTime = service.end_time ? toZonedTime(new Date(service.end_time), timezone) : null

  const venueName = service.venue_info?.name || service.venue
  const venueAddress = service.venue_info
    ? [service.venue_info.address, service.venue_info.city, service.venue_info.state]
        .filter(Boolean)
        .join(', ')
    : null

  const isToday = format(startTime, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')

  if (variant === 'compact') {
    return (
      <Card className={cn(
        'transition-colors',
        isToday && 'border-primary bg-primary/5'
      )}>
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center min-w-[44px] text-center">
              <span className="text-xs text-muted-foreground uppercase">
                {format(startTime, 'EEE')}
              </span>
              <span className={cn(
                'text-xl font-bold',
                isToday && 'text-primary'
              )}>
                {format(startTime, 'd')}
              </span>
              <span className="text-xs text-muted-foreground">
                {format(startTime, 'MMM')}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{service.name}</p>
              {showProject && service.project && (
                <p className="text-sm text-muted-foreground truncate">
                  {service.project.name}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <span>{format(startTime, 'h:mm a')}</span>
                {venueName && (
                  <>
                    <span>·</span>
                    <span className="truncate">{venueName}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn(
      isToday && 'border-primary'
    )}>
      {isToday && (
        <div className="bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground">
          Today
        </div>
      )}
      <CardContent className="p-4">
        <div className="space-y-3">
          <div>
            <h3 className="font-semibold">{service.name}</h3>
            {showProject && service.project && (
              <p className="text-sm text-muted-foreground">
                {service.project.name}
                {service.project.organization && ` · ${service.project.organization.name}`}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{service.service_type}</Badge>
            {service.instrument && (
              <Badge variant="outline" className="flex items-center gap-1">
                <Music2 className="h-3 w-3" />
                {service.instrument.name}
                {service.chair_number && service.chair_number > 1 && ` - Chair ${service.chair_number}`}
              </Badge>
            )}
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4 shrink-0" />
              <span>{format(startTime, 'EEEE, MMMM d, yyyy')}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4 shrink-0" />
              <span>
                {format(startTime, 'h:mm a')}
                {endTime && ` - ${format(endTime, 'h:mm a')}`}
              </span>
            </div>
            {venueName && (
              <div className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p>{venueName}</p>
                  {venueAddress && (
                    <p className="text-xs">{venueAddress}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
