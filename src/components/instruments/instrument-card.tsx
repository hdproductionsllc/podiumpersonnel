'use client'

import { MoreHorizontal } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Instrument } from '@/types'

interface InstrumentCardProps {
  instrument: Instrument
  canManage: boolean
  onEdit: (instrument: Instrument) => void
  onDelete: (instrument: Instrument) => void
}

export function InstrumentCard({
  instrument,
  canManage,
  onEdit,
  onDelete,
}: InstrumentCardProps) {
  return (
    <Card className="py-3">
      <CardContent className="flex items-center justify-between">
        <div>
          <p className="font-medium">{instrument.name}</p>
          {instrument.abbreviation && (
            <p className="text-sm text-muted-foreground">
              {instrument.abbreviation}
            </p>
          )}
        </div>
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
      </CardContent>
    </Card>
  )
}
