'use client'

import * as React from 'react'

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

interface TimePickerProps {
  value: string // "HH:mm" 24h format or ""
  onChange: (value: string) => void
  placeholder?: string
}

function parse24h(value: string): { hour: number; minute: number; ampm: 'AM' | 'PM' } {
  if (!value) return { hour: 7, minute: 0, ampm: 'PM' }
  const [h, m] = value.split(':').map(Number)
  const ampm: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM'
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return { hour: hour12, minute: m, ampm }
}

function to24h(hour: number, minute: number, ampm: 'AM' | 'PM'): string {
  let h24 = hour
  if (ampm === 'AM' && hour === 12) h24 = 0
  else if (ampm === 'PM' && hour !== 12) h24 = hour + 12
  return `${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function TimePicker({ value, onChange, placeholder }: TimePickerProps) {
  const parsed = parse24h(value)
  const [hour, setHour] = React.useState(parsed.hour)
  const [minute, setMinute] = React.useState(parsed.minute)
  const [ampm, setAmpm] = React.useState(parsed.ampm)
  const [isEmpty, setIsEmpty] = React.useState(!value)

  React.useEffect(() => {
    if (!value) {
      setIsEmpty(true)
      return
    }
    const p = parse24h(value)
    setHour(p.hour)
    setMinute(p.minute)
    setAmpm(p.ampm)
    setIsEmpty(false)
  }, [value])

  function handleChange(newHour: number, newMinute: number, newAmpm: 'AM' | 'PM') {
    setIsEmpty(false)
    onChange(to24h(newHour, newMinute, newAmpm))
  }

  if (isEmpty) {
    return (
      <button
        type="button"
        onClick={() => {
          setIsEmpty(false)
          onChange(to24h(hour, minute, ampm))
        }}
        className="flex h-9 w-full items-center rounded-md border border-input bg-transparent px-2 text-sm text-muted-foreground shadow-sm hover:bg-accent"
      >
        <svg className="mr-1.5 h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        {placeholder || 'Set time'}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-0.5">
      <select
        className="rounded-md border bg-background px-1 py-1.5 text-sm h-9 min-w-0 flex-1"
        value={hour}
        onChange={(e) => {
          const h = Number(e.target.value)
          setHour(h)
          handleChange(h, minute, ampm)
        }}
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className="text-xs font-medium">:</span>
      <select
        className="rounded-md border bg-background px-1 py-1.5 text-sm h-9 min-w-0 flex-1"
        value={minute}
        onChange={(e) => {
          const m = Number(e.target.value)
          setMinute(m)
          handleChange(hour, m, ampm)
        }}
      >
        {MINUTES.map((m) => (
          <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
        ))}
      </select>
      <select
        className="rounded-md border bg-background px-1 py-1.5 text-sm h-9 min-w-0 flex-1"
        value={ampm}
        onChange={(e) => {
          const a = e.target.value as 'AM' | 'PM'
          setAmpm(a)
          handleChange(hour, minute, a)
        }}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  )
}
