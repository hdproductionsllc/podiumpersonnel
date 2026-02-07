'use client'

import type { ConflictInfo } from './project-positions'

interface ConflictsSummaryProps {
  conflicts: ConflictInfo[]
}

export function ConflictsSummary({ conflicts }: ConflictsSummaryProps) {
  if (conflicts.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <svg className="h-4 w-4 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
        <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-300">
          Schedule Conflicts ({conflicts.length})
        </h4>
      </div>
      <div className="overflow-x-auto rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20">
        <table className="w-full text-sm">
          <thead className="border-b border-amber-200 dark:border-amber-900">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-xs">Musician</th>
              <th className="px-3 py-2 text-left font-medium text-xs">Position</th>
              <th className="px-3 py-2 text-left font-medium text-xs">Service</th>
              <th className="px-3 py-2 text-left font-medium text-xs">Conflict</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-200 dark:divide-amber-900">
            {conflicts.map((conflict, i) => (
              <tr key={i}>
                <td className="px-3 py-2 font-medium">{conflict.musicianName}</td>
                <td className="px-3 py-2 text-muted-foreground">{conflict.positionLabel}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {conflict.service.name} ({new Date(conflict.service.start_time).toLocaleDateString()})
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {conflict.schedule.title} ({new Date(conflict.schedule.start_time).toLocaleDateString()} – {new Date(conflict.schedule.end_time).toLocaleDateString()})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
