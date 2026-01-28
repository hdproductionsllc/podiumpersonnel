'use client'

import { useState, useMemo, useEffect } from 'react'
import { format, isSameDay, startOfMonth, endOfMonth, addMonths } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { DEFAULT_TIMEZONE } from '@/lib/utils'
import { ServiceCard } from './service-card'
import { CalendarView } from './calendar-view'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Calendar, List, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Service {
  id: string
  name: string
  service_type: string
  start_time: string
  end_time: string | null
  venue: string | null
  venue_info?: any
  project?: {
    id: string
    name: string
    organization?: {
      id: string
      name: string
      timezone: string | null
    } | null
  } | null
  instrument?: { id: string; name: string } | null
  chair_number?: number
}

interface Organization {
  id: string
  name: string
}

interface ScheduleClientProps {
  initialServices: Service[]
  organizations: Organization[]
}

type ViewType = 'list' | 'calendar'

export function ScheduleClient({ initialServices, organizations }: ScheduleClientProps) {
  const [services, setServices] = useState<Service[]>(initialServices)
  const [view, setView] = useState<ViewType>('list')
  const [selectedOrgId, setSelectedOrgId] = useState<string>('all')
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Filter services by organization
  const filteredServices = useMemo(() => {
    let filtered = services
    if (selectedOrgId !== 'all') {
      filtered = filtered.filter((s) => s.project?.organization?.id === selectedOrgId)
    }
    return filtered
  }, [services, selectedOrgId])

  // Group services by month for list view
  const servicesByMonth = useMemo(() => {
    const groups = new Map<string, Service[]>()

    filteredServices
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .forEach((service) => {
        const timezone = service.project?.organization?.timezone || DEFAULT_TIMEZONE
        const date = toZonedTime(new Date(service.start_time), timezone)
        const monthKey = format(date, 'yyyy-MM')
        if (!groups.has(monthKey)) {
          groups.set(monthKey, [])
        }
        groups.get(monthKey)!.push(service)
      })

    return groups
  }, [filteredServices])

  // Services for selected date (calendar view)
  const servicesForSelectedDate = useMemo(() => {
    if (!selectedDate) return []
    return filteredServices.filter((service) => {
      const timezone = service.project?.organization?.timezone || DEFAULT_TIMEZONE
      const serviceDate = toZonedTime(new Date(service.start_time), timezone)
      return isSameDay(serviceDate, selectedDate)
    })
  }, [filteredServices, selectedDate])

  const handleDateSelect = (date: Date) => {
    setSelectedDate((prev) => (prev && isSameDay(prev, date) ? null : date))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold">Schedule</h1>

        <div className="flex items-center gap-2">
          {/* Organization Filter */}
          {organizations.length > 1 && (
            <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Organizations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Organizations</SelectItem>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* View Toggle */}
          <div className="flex rounded-lg border p-1">
            <Button
              variant={view === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setView('list')}
              className="h-8"
            >
              <List className="h-4 w-4" />
              <span className="ml-2 hidden sm:inline">List</span>
            </Button>
            <Button
              variant={view === 'calendar' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setView('calendar')}
              className="h-8"
            >
              <Calendar className="h-4 w-4" />
              <span className="ml-2 hidden sm:inline">Calendar</span>
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : filteredServices.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Calendar className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-medium">No scheduled services</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {selectedOrgId !== 'all'
              ? 'No services found for this organization.'
              : 'Your confirmed gigs will appear here once you accept offers.'}
          </p>
        </div>
      ) : view === 'list' ? (
        <div className="space-y-8">
          {Array.from(servicesByMonth.entries()).map(([monthKey, monthServices]) => {
            const monthDate = new Date(monthKey + '-01')
            return (
              <div key={monthKey}>
                <h2 className="font-semibold text-lg mb-4 sticky top-0 bg-background py-2">
                  {format(monthDate, 'MMMM yyyy')}
                </h2>
                <div className="space-y-3">
                  {monthServices.map((service) => (
                    <ServiceCard
                      key={service.id}
                      service={service}
                      showProject={true}
                      variant="compact"
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-6">
          <CalendarView
            services={filteredServices}
            onDateSelect={handleDateSelect}
            selectedDate={selectedDate}
          />

          {/* Selected Date Services */}
          {selectedDate && (
            <div>
              <h3 className="font-semibold mb-3">
                {format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </h3>
              {servicesForSelectedDate.length === 0 ? (
                <p className="text-sm text-muted-foreground">No services on this date.</p>
              ) : (
                <div className="space-y-3">
                  {servicesForSelectedDate.map((service) => (
                    <ServiceCard
                      key={service.id}
                      service={service}
                      showProject={true}
                      variant="full"
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ScheduleSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-28" />
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-32 mb-4" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  )
}
