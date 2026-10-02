'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useVertical } from '@/components/providers/vertical-provider'
import { addSessionChoices, term } from '@/lib/verticals'
import type { ServiceType } from '@/lib/validations/projects'

interface ServiceTypeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The vertical's choices (addSessionChoices): music offers rehearsal and performance */
  onSelect: (type: ServiceType) => void
}

export function ServiceTypeDialog({
  open,
  onOpenChange,
  onSelect,
}: ServiceTypeDialogProps) {
  const vertical = useVertical()
  const { terms } = vertical
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add {term(terms, 'session')}</DialogTitle>
          <DialogDescription>
            What type of {term(terms, 'session', { case: 'lower' })} would you like to add?
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-4">
          {addSessionChoices(vertical).map((choice) => (
            <Button
              key={choice.key}
              variant="outline"
              className="h-auto py-4 flex flex-col items-start"
              onClick={() => onSelect(choice.key)}
            >
              <span className="font-semibold">{choice.label}</span>
              {choice.description && (
                <span className="text-sm text-muted-foreground font-normal">{choice.description}</span>
              )}
            </Button>
          ))}
        </div>

        <div className="flex justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
