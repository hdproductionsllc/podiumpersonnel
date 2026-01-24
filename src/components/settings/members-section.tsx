'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AddMemberDialog } from './add-member-dialog'
import { ChangeRoleDialog } from './change-role-dialog'
import { RemoveMemberDialog } from './remove-member-dialog'

interface Member {
  id: string
  user_id: string
  role: string
  email: string
  created_at: string
}

interface MembersSectionProps {
  role: 'owner' | 'admin' | 'member'
  currentUserId: string
}

const roleBadgeClasses: Record<string, string> = {
  owner: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  admin: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  member: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
}

export function MembersSection({ role, currentUserId }: MembersSectionProps) {
  const [members, setMembers] = useState<Member[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [changeRoleMember, setChangeRoleMember] = useState<Member | null>(null)
  const [removeMember, setRemoveMember] = useState<Member | null>(null)

  const isOwner = role === 'owner'

  const fetchMembers = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const response = await fetch('/api/settings/members')
    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Failed to load members')
      setIsLoading(false)
      return
    }

    setMembers(result.members)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  function handleAddSuccess() {
    setAddDialogOpen(false)
    fetchMembers()
  }

  function handleRoleSuccess() {
    setChangeRoleMember(null)
    fetchMembers()
  }

  function handleRemoveSuccess() {
    setRemoveMember(null)
    fetchMembers()
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Members</CardTitle>
              <CardDescription>Manage organization members and their roles</CardDescription>
            </div>
            {isOwner && (
              <Button onClick={() => setAddDialogOpen(true)}>Add Member</Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading members...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 pr-4 text-left font-medium">Email</th>
                    <th className="py-2 pr-4 text-left font-medium">Role</th>
                    {isOwner && <th className="py-2 text-right font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        {member.email}
                        {member.user_id === currentUserId && (
                          <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${roleBadgeClasses[member.role] || roleBadgeClasses.member}`}>
                          {member.role}
                        </span>
                      </td>
                      {isOwner && (
                        <td className="py-2 text-right">
                          {member.user_id !== currentUserId && member.role !== 'owner' && (
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setChangeRoleMember(member)}
                              >
                                Change Role
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setRemoveMember(member)}
                              >
                                Remove
                              </Button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AddMemberDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={handleAddSuccess}
      />
      <ChangeRoleDialog
        open={!!changeRoleMember}
        onOpenChange={(open) => { if (!open) setChangeRoleMember(null) }}
        member={changeRoleMember}
        onSuccess={handleRoleSuccess}
      />
      <RemoveMemberDialog
        open={!!removeMember}
        onOpenChange={(open) => { if (!open) setRemoveMember(null) }}
        member={removeMember}
        onSuccess={handleRemoveSuccess}
      />
    </>
  )
}
