'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
} from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CalendarService {
  id: string
  name: string
  service_type: string
  call_time: string | null
  start_time: string
  end_time: string | null
  venue: string | null
  projectId: string
  projectName: string
  staffingStatus: 'fully_staffed' | 'has_vacancies' | 'has_pending' | 'unknown'
}

interface DashboardCalendarProps {
  services: CalendarService[]
  timezone: string
}

const SERVICE_TYPE_COLORS: Record<string, { dot: string; bg: string; text: string }> = {
  performance: {
    dot: 'bg-purple-500',
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    text: 'text-purple-700 dark:text-purple-300',
  },
  rehearsal: {
    dot: 'bg-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    text: 'text-blue-700 dark:text-blue-300',
  },
  other: {
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
}

const STAFFING_INDICATORS: Record<string, { color: string; label: string }> = {
  fully_staffed: { color: 'bg-green-500', label: 'Fully staffed' },
  has_vacancies: { color: 'bg-red-500', label: 'Has vacancies' },
  has_pending: { color: 'bg-yellow-500', label: 'Offers pending' },
  unknown: { color: 'bg-gray-400', label: '' },
}

export function DashboardCalendar({ services, timezone }: DashboardCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  // Group services by date
  const servicesByDate = useMemo(() => {
    const map = new Map<string, CalendarService[]>()
    services.forEach((service) => {
      const date = toZonedTime(new Date(service.start_time), timezone)
      const dateKey = format(date, 'yyyy-MM-dd')
      if (!map.has(dateKey)) {
        map.set(dateKey, [])
      }
      map.get(dateKey)!.push(service)
    })
    return map
  }, [services, timezone])

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(monthStart)
    const startDate = startOfWeek(monthStart, { weekStartsOn: 0 })
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 })

    const days = []
    let day = startDate
    while (day <= endDate) {
      days.push(day)
      day = addDays(day, 1)
    }
    return days
  }, [currentMonth])

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  // Get selected day's services
  const selectedDayServices = useMemo(() => {
    if (!selectedDate) return []
    const dateKey = format(selectedDate, 'yyyy-MM-dd')
    return (servicesByDate.get(dateKey) || []).sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    )
  }, [selectedDate, servicesByDate])

  // Count services this month
  const monthServiceCount = useMemo(() => {
    let count = 0
    servicesByDate.forEach((svcs, dateKey) => {
      const date = new Date(dateKey)
      if (isSameMonth(date, currentMonth)) {
        count += svcs.length
      }
    })
    return count
  }, [servicesByDate, currentMonth])

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    })
  }

  return (
    <div className="space-y-4">
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">
            {format(currentMonth, 'MMMM yyyy')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {monthServiceCount} service{monthServiceCount !== 1 ? 's' : ''} this month
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setCurrentMonth(new Date())
              setSelectedDate(new Date())
            }}
          >
            Today
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {/* Week day headers */}
        {weekDays.map((day) => (
          <div
            key={day}
            className="h-8 flex items-center justify-center text-xs font-medium text-muted-foreground bg-muted/30"
          >
            {day}
          </div>
        ))}

        {/* Calendar days */}
        {calendarDays.map((day, index) => {
          const dateKey = format(day, 'yyyy-MM-dd')
          const dayServices = servicesByDate.get(dateKey) || []
          const isCurrentMonth = isSameMonth(day, currentMonth)
          const isToday = isSameDay(day, new Date())
          const isSelected = selectedDate && isSameDay(day, selectedDate)
          const hasServices = dayServices.length > 0

          // Get unique service types for this day
          const serviceTypes = [...new Set(dayServices.map((s) => s.service_type || 'other'))]

          return (
            <button
              key={index}
              onClick={() => setSelectedDate(day)}
              className={cn(
                'h-16 md:h-18 flex flex-col items-center justify-start pt-1.5 transition-colors relative bg-background',
                'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset',
                !isCurrentMonth && 'opacity-30',
                isToday && 'bg-primary/5',
                isSelected && 'bg-primary/10 ring-2 ring-primary ring-inset'
              )}
            >
              <span
                className={cn(
                  'text-sm leading-none',
                  isToday && 'font-bold text-primary',
                  !isToday && !isCurrentMonth && 'text-muted-foreground'
                )}
              >
                {format(day, 'd')}
              </span>
              {hasServices && (
                <div className="flex flex-col items-center gap-0.5 mt-1">
                  <div className="flex gap-0.5">
                    {serviceTypes.slice(0, 3).map((type) => (
                      <div
                        key={type}
                        className={cn('w-1.5 h-1.5 rounded-full', SERVICE_TYPE_COLORS[type]?.dot || SERVICE_TYPE_COLORS.other.dot)}
                      />
                    ))}
                  </div>
                  {dayServices.length > 1 && (
                    <span className="text-[9px] leading-none text-muted-foreground font-medium">
                      {dayServices.length}
                    </span>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
          <span>Performance</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          <span>Rehearsal</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Other</span>
        </div>
      </div>

      {/* Selected Day Detail */}
      {selectedDate && (
        <div className="border-t pt-4">
          <h4 className="font-medium text-sm mb-2">
            {format(selectedDate, 'EEEE, MMMM d, yyyy')}
          </h4>
          {selectedDayServices.length > 0 ? (
            <div className="space-y-2">
              {selectedDayServices.map((service) => {
                const typeColors = SERVICE_TYPE_COLORS[service.service_type] || SERVICE_TYPE_COLORS.other
                const staffing = STAFFING_INDICATORS[service.staffingStatus]

                return (
                  <Link
                    key={service.id}
                    href={`/dashboard/projects?expand=${service.projectId}`}
                    className={cn(
                      'block rounded-lg p-3 transition-all hover:shadow-sm border-l-3',
                      typeColors.bg,
                      service.service_type === 'performance'
                        ? 'border-l-purple-400'
                        : service.service_type === 'rehearsal'
                          ? 'border-l-blue-400'
                          : 'border-l-emerald-400'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{service.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {service.projectName}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          {service.call_time && (
                            <span>Call: {formatTime(service.call_time)}</span>
                          )}
                          <span>
                            {formatTime(service.start_time)}
                            {service.end_time && ` - ${formatTime(service.end_time)}`}
                          </span>
                        </div>
                        {service.venue && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {service.venue}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {staffing && staffing.label && (
                          <div className="flex items-center gap-1">
                            <div className={cn('w-1.5 h-1.5 rounded-full', staffing.color)} />
                            <span className="text-[10px] text-muted-foreground">{staffing.label}</span>
                          </div>
                        )}
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', typeColors.text)}>
                          {service.service_type || 'other'}
                        </span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No services on this day.</p>
          )}
        </div>
      )}
    </div>
  )
}
