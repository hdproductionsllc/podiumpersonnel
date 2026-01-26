'use client'

import { useState } from 'react'
import { MoreHorizontal, ChevronDown, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { InstrumentWithMusicians } from './instruments-client'

interface InstrumentCardProps {
  instrument: InstrumentWithMusicians
  canManage: boolean
  onEdit: (instrument: InstrumentWithMusicians) => void
  onDelete: (instrument: InstrumentWithMusicians) => void
}

export function InstrumentCard({
  instrument,
  canManage,
  onEdit,
  onDelete,
}: InstrumentCardProps) {
  const [expanded, setExpanded] = useState(false)

  const musicians = instrument.musician_instruments
    ?.map((mi) => mi.musician)
    .filter((m) => m && m.is_active)
    .sort((a, b) => `${a.last_name}, ${a.first_name}`.localeCompare(`${b.last_name}, ${b.first_name}`)) || []

  const musicianCount = musicians.length

  return (
    <Card className="py-3">
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="font-medium">{instrument.name}</p>
            {instrument.abbreviation && (
              <p className="text-sm text-muted-foreground">
                {instrument.abbreviation}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {musicianCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => setExpanded(!expanded)}
              >
                <span className="mr-1">{musicianCount}</span>
                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </Button>
            )}
            {musicianCount === 0 && (
              <span className="text-xs text-muted-foreground px-2">0</span>
            )}
            {canManage && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(instrument)}>
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(instrument)}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {expanded && musicians.length > 0 && (
          <div className="border-t pt-2 mt-2">
            <ul className="space-y-1">
              {musicians.map((m) => (
                <li key={m.id} className="text-sm text-muted-foreground">
                  {m.last_name}, {m.first_name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
