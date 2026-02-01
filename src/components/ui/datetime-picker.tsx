'use client'

import * as React from 'react'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface DateTimePickerProps {
  value: string // "YYYY-MM-DDTHH:mm" format
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  defaultMonth?: Date
}

function parseValue(value: string) {
  if (!value) return { date: undefined, hour: 7, minute: 0, ampm: 'PM' as const }
  const [datePart, timePart] = value.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hours, minutes] = (timePart || '19:00').split(':').map(Number)
  const ampm = hours >= 12 ? 'PM' as const : 'AM' as const
  const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours
  return {
    date: new Date(year, month - 1, day),
    hour: hour12,
    minute: minutes,
    ampm,
  }
}

function formatDisplay(value: string) {
  if (!value) return ''
  const { date, hour, minute, ampm } = parseValue(value)
  if (!date) return ''
  return `${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} ${hour}:${String(minute).padStart(2, '0')} ${ampm}`
}

function buildValue(date: Date | undefined, hour: number, minute: number, ampm: 'AM' | 'PM'): string {
  if (!date) return ''
  let h24 = hour
  if (ampm === 'AM' && hour === 12) h24 = 0
  else if (ampm === 'PM' && hour !== 12) h24 = hour + 12
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}T${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

export function DateTimePicker({ value, onChange, placeholder = 'Select date & time', className, defaultMonth }: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false)
  const parsed = parseValue(value)
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(parsed.date)
  const [selectedHour, setSelectedHour] = React.useState(parsed.hour)
  const [selectedMinute, setSelectedMinute] = React.useState(parsed.minute)
  const [selectedAmpm, setSelectedAmpm] = React.useState<'AM' | 'PM'>(parsed.ampm)

  // Sync internal state when value prop changes externally
  React.useEffect(() => {
    const p = parseValue(value)
    setSelectedDate(p.date)
    setSelectedHour(p.hour)
    setSelectedMinute(p.minute)
    setSelectedAmpm(p.ampm)
  }, [value])

  function handleSet() {
    const newValue = buildValue(selectedDate, selectedHour, selectedMinute, selectedAmpm)
    if (newValue) {
      onChange(newValue)
    }
    setOpen(false)
  }

  function handleClear() {
    onChange('')
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-full justify-start text-left font-normal h-9',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <svg className="mr-2 h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
          </svg>
          <span className="truncate">
            {value ? formatDisplay(value) : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 z-[100]" align="start" sideOffset={4}>
        <div className="p-3">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            defaultMonth={selectedDate || defaultMonth}
          />
          <div className="border-t mt-3 pt-3">
            <div className="flex items-center gap-2">
              {/* Hour */}
              <select
                className="rounded-md border bg-background px-2 py-1.5 text-sm flex-1"
                value={selectedHour}
                onChange={(e) => setSelectedHour(Number(e.target.value))}
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <span className="text-sm font-medium">:</span>
              {/* Minute */}
              <select
                className="rounded-md border bg-background px-2 py-1.5 text-sm flex-1"
                value={selectedMinute}
                onChange={(e) => setSelectedMinute(Number(e.target.value))}
              >
                {MINUTES.map((m) => (
                  <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                ))}
              </select>
              {/* AM/PM */}
              <select
                className="rounded-md border bg-background px-2 py-1.5 text-sm"
                value={selectedAmpm}
                onChange={(e) => setSelectedAmpm(e.target.value as 'AM' | 'PM')}
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>
          </div>
          <div className="flex justify-between mt-3 gap-2">
            <Button variant="ghost" size="sm" onClick={handleClear}>
              Clear
            </Button>
            <Button size="sm" onClick={handleSet} disabled={!selectedDate}>
              Set
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
