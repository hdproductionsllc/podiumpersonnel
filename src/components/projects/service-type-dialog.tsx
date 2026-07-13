'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useTerms } from '@/components/providers/vertical-provider'
import { term } from '@/lib/verticals'

interface ServiceTypeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (type: 'rehearsal' | 'performance') => void
}

export function ServiceTypeDialog({
  open,
  onOpenChange,
  onSelect,
}: ServiceTypeDialogProps) {
  const terms = useTerms()
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
          <Button
            variant="outline"
            className="h-auto py-4 flex flex-col items-start"
            onClick={() => onSelect('rehearsal')}
          >
            <span className="font-semibold">Rehearsal</span>
            <span className="text-sm text-muted-foreground font-normal">
              Practice session for the {term(terms, 'person', { plural: true, case: 'lower' })}
            </span>
          </Button>

          <Button
            variant="outline"
            className="h-auto py-4 flex flex-col items-start"
            onClick={() => onSelect('performance')}
          >
            <span className="font-semibold">Performance</span>
            <span className="text-sm text-muted-foreground font-normal">
              Concert or public performance
            </span>
          </Button>
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
