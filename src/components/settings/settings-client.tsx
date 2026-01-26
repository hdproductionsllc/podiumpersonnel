'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { OrganizationSection } from './organization-section'
import { MembersSection } from './members-section'
import { ProfileSection } from './profile-section'
import { EmailBrandingSection } from './email-branding-section'

const tabs = [
  { id: 'organization', label: 'Organization' },
  { id: 'email-branding', label: 'Email Branding' },
  { id: 'members', label: 'Members' },
  { id: 'profile', label: 'Profile' },
] as const

type TabId = (typeof tabs)[number]['id']

interface SettingsClientProps {
  organization: {
    id: string
    name: string
    slug: string
    timezone: string
    musician_policy?: string | null
    email_logo_url?: string | null
    email_brand_color?: string | null
    email_footer_text?: string | null
  }
  role: 'owner' | 'admin' | 'member'
  currentUserId: string
}

export function SettingsClient({ organization, role, currentUserId }: SettingsClientProps) {
  const [activeTab, setActiveTab] = useState<TabId>('organization')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Manage your organization and account settings</p>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant="ghost"
            className={cn(
              'rounded-b-none border-b-2 border-transparent px-4',
              activeTab === tab.id && 'border-b-primary bg-muted/50'
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <div>
        {activeTab === 'organization' && (
          <OrganizationSection organization={organization} role={role} />
        )}
        {activeTab === 'email-branding' && (
          <EmailBrandingSection organization={organization} role={role} />
        )}
        {activeTab === 'members' && (
          <MembersSection role={role} currentUserId={currentUserId} />
        )}
        {activeTab === 'profile' && (
          <ProfileSection />
        )}
      </div>
    </div>
  )
}
