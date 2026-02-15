'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { OrganizationSection } from './organization-section'
import { MembersSection } from './members-section'
import { ProfileSection } from './profile-section'
import { EmailBrandingSection } from './email-branding-section'
import { BillingSection } from './billing-section'
import { Card, CardContent } from '@/components/ui/card'
import { X, PartyPopper } from 'lucide-react'

const tabs = [
  { id: 'organization', label: 'Organization' },
  { id: 'email-branding', label: 'Email Branding' },
  { id: 'members', label: 'Members' },
  { id: 'billing', label: 'Billing' },
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
  showSetupPrompt?: boolean
  openBillingTab?: boolean
}

export function SettingsClient({ organization, role, currentUserId, showSetupPrompt, openBillingTab }: SettingsClientProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabId>(openBillingTab ? 'billing' : 'organization')
  const [showWelcome, setShowWelcome] = useState(showSetupPrompt || false)

  // Remove the query param from URL without refresh
  useEffect(() => {
    if (showSetupPrompt) {
      window.history.replaceState({}, '', '/dashboard/settings')
    }
  }, [showSetupPrompt])

  const dismissWelcome = () => {
    setShowWelcome(false)
  }

  return (
    <div className="space-y-6">
      {showWelcome && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-primary/10 p-2">
                <PartyPopper className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Welcome to Podium!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Your organization has been created. Take a moment to set up your <strong>Musician Policy</strong> below -
                  this is shown to musicians when they accept contract offers.
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={dismissWelcome} className="shrink-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
        {activeTab === 'billing' && (
          <BillingSection />
        )}
        {activeTab === 'profile' && (
          <ProfileSection />
        )}
      </div>
    </div>
  )
}
