'use client'

import { useTerms } from '@/components/providers/vertical-provider'
import { term } from '@/lib/verticals'

export interface CallOption {
  id: string
  name: string
  start_time: string
}

/** "Fri, Oct 9, 7:00 AM" in the organization's time zone. */
export function formatCallTime(iso: string, timezone?: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(timezone ? { timeZone: timezone } : {}),
  })
}

/**
 * Which calls a chair (or every chair of a requirement) works: every call of
 * the gig, or only the ticked ones. `selected === null` means every call.
 * Only shown to an organization with call_scoped_requirements on.
 */
export function CallChoice({
  services,
  selected,
  onChange,
  timezone,
  disabled,
}: {
  services: CallOption[]
  selected: string[] | null
  onChange: (next: string[] | null) => void
  timezone?: string
  disabled?: boolean
}) {
  const terms = useTerms()
  const calls = term(terms, 'session', { plural: true, case: 'lower' })
  const ordered = [...services].sort((a, b) => a.start_time.localeCompare(b.start_time))
  const every = selected === null

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          checked={every}
          disabled={disabled}
          onChange={() => onChange(null)}
        />
        Every {term(terms, 'session', { case: 'lower' })} of this {term(terms, 'work', { case: 'lower' })}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          checked={!every}
          disabled={disabled || ordered.length === 0}
          onChange={() => onChange(selected ?? [])}
        />
        Only some {calls}
      </label>
      {!every && (
        <div className="ml-6 space-y-1.5 rounded-md border p-2">
          {ordered.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={disabled}
                checked={selected!.includes(s.id)}
                onChange={(e) =>
                  onChange(e.target.checked ? [...selected!, s.id] : selected!.filter((id) => id !== s.id))
                }
              />
              <span>{s.name}</span>
              <span className="text-xs text-muted-foreground">{formatCallTime(s.start_time, timezone)}</span>
            </label>
          ))}
          {selected!.length === 0 && (
            <p className="text-xs text-destructive">Tick at least one.</p>
          )}
        </div>
      )}
    </div>
  )
}
