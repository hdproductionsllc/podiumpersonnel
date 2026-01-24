'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface ChangeRoleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: { id: string; email: string; role: string } | null
  onSuccess: () => void
}

export function ChangeRoleDialog({ open, onOpenChange, member, onSuccess }: ChangeRoleDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedRole, setSelectedRole] = useState<string>('')

  function handleOpenChange(isOpen: boolean) {
    if (isOpen && member) {
      setSelectedRole(member.role === 'admin' ? 'member' : 'admin')
      setError(null)
    }
    onOpenChange(isOpen)
  }

  async function handleSubmit() {
    if (!member) return
    setIsLoading(true)
    setError(null)

    const response = await fetch(`/api/settings/members/${member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: selectedRole }),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Failed to change role')
      setIsLoading(false)
      return
    }

    setIsLoading(false)
    onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Role</DialogTitle>
          <DialogDescription>
            Change the role for {member?.email}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div>
            <label className="text-sm font-medium">New Role</label>
            <select
              className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
