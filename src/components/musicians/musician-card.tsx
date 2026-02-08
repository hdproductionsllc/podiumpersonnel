'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { MusicianWithInstruments } from './musicians-client'

interface MusicianCardProps {
  musician: MusicianWithInstruments
  canManage: boolean
  selectMode: boolean
  isSelected: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
}

export function MusicianCard({
  musician,
  canManage,
  selectMode,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
}: MusicianCardProps) {
  return (
    <Card
      className={`relative transition-all hover:shadow-md hover:-translate-y-0.5 ${
        selectMode ? 'cursor-pointer' : ''
      } ${isSelected ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950/30' : ''}`}
      onClick={selectMode ? onSelect : undefined}
    >
      {selectMode && (
        <div className="absolute top-3 right-3">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300"
            checked={isSelected}
            onChange={onSelect}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      <CardContent className="pt-4">
        <div className="space-y-3">
          {/* Name and status badges */}
          <div>
            <h3 className="font-semibold text-lg">
              {musician.last_name}, {musician.first_name}
            </h3>
            <div className="flex flex-wrap gap-1 mt-1">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  musician.is_active
                    ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                }`}
              >
                {musician.is_active ? 'Active' : 'Inactive'}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  musician.w9_on_file
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-orange-950 dark:text-orange-300'
                }`}
              >
                {musician.w9_on_file ? 'W-9' : 'No W-9'}
              </span>
              {(!musician.email || !musician.phone) && (
                <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                  Missing info
                </span>
              )}
            </div>
          </div>

          {/* Contact info */}
          <div className="text-sm space-y-1">
            {musician.email ? (
              <a
                href={`mailto:${musician.email}`}
                className="block text-blue-600 hover:text-blue-800 dark:text-blue-400 hover:underline truncate"
                onClick={(e) => e.stopPropagation()}
              >
                {musician.email}
              </a>
            ) : (
              <span className="block text-muted-foreground">No email</span>
            )}
            {musician.phone ? (
              <a
                href={`tel:${musician.phone.replace(/[^\d+]/g, '')}`}
                className="block text-muted-foreground hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {musician.phone}
              </a>
            ) : (
              <span className="block text-muted-foreground">No phone</span>
            )}
          </div>

          {/* Instruments */}
          {musician.musician_instruments.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {musician.musician_instruments.map((mi) => (
                <span
                  key={mi.id}
                  className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                >
                  {mi.instrument.abbreviation || mi.instrument.name}
                </span>
              ))}
            </div>
          )}

          {/* Region */}
          {musician.home_region && (
            <p className="text-xs text-muted-foreground">
              Region: {musician.home_region}
            </p>
          )}

          {/* Tags */}
          {musician.tags && musician.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {musician.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Actions */}
          {canManage && !selectMode && (
            <div className="flex gap-2 pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit()
                }}
              >
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
              >
                Delete
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
