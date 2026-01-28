'use client'

import { useState, useMemo } from 'react'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn, DEFAULT_TIMEZONE } from '@/lib/utils'

interface Service {
  id: string
  name: string
  service_type: string
  start_time: string
  project?: {
    id: string
    name: string
    organization?: {
      id: string
      name: string
      timezone: string | null
    } | null
  } | null
}

interface CalendarViewProps {
  services: Service[]
  onDateSelect?: (date: Date) => void
  selectedDate?: Date | null
}

export function CalendarView({ services, onDateSelect, selectedDate }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())

  const servicesByDate = useMemo(() => {
    const map = new Map<string, Service[]>()
    services.forEach((service) => {
      const timezone = service.project?.organization?.timezone || DEFAULT_TIMEZONE
      const date = toZonedTime(new Date(service.start_time), timezone)
      const dateKey = format(date, 'yyyy-MM-dd')
      if (!map.has(dateKey)) {
        map.set(dateKey, [])
      }
      map.get(dateKey)!.push(service)
    })
    return map
  }, [services])

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

  const goToPreviousMonth = () => setCurrentMonth(subMonths(currentMonth, 1))
  const goToNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1))
  const goToToday = () => setCurrentMonth(new Date())

  return (
    <Card>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goToToday}>
              Today
            </Button>
            <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={goToNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {/* Week day headers */}
          {weekDays.map((day) => (
            <div
              key={day}
              className="h-8 flex items-center justify-center text-xs font-medium text-muted-foreground"
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

            return (
              <button
                key={index}
                onClick={() => onDateSelect?.(day)}
                disabled={!isCurrentMonth}
                className={cn(
                  'h-12 md:h-14 flex flex-col items-center justify-start pt-1 rounded-lg transition-colors relative',
                  'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                  !isCurrentMonth && 'opacity-30 cursor-not-allowed',
                  isToday && 'bg-primary/10',
                  isSelected && 'bg-primary/20 ring-2 ring-primary'
                )}
              >
                <span
                  className={cn(
                    'text-sm font-medium',
                    isToday && 'text-primary font-bold'
                  )}
                >
                  {format(day, 'd')}
                </span>
                {hasServices && (
                  <div className="flex gap-0.5 mt-1">
                    {dayServices.slice(0, 3).map((_, i) => (
                      <div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-primary"
                      />
                    ))}
                    {dayServices.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">+{dayServices.length - 3}</span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
            <span>Service</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-primary/10" />
            <span>Today</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
