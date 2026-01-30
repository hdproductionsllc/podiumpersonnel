'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const STEPS = [
  {
    title: 'Welcome to Podium!',
    content:
      'Your instruments are already pre-loaded. Here\'s a quick overview of how Podium works to help you manage your orchestra personnel.',
    icon: (
      <svg className="h-12 w-12 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V4.103A2.25 2.25 0 0 0 17.378 2h-.403a2.25 2.25 0 0 0-1.5.563L9 9m10.5-3H9m0 0v7.5" />
      </svg>
    ),
  },
  {
    title: 'Import Your Musicians',
    content:
      'Head to the Musicians page to build your roster. Add each musician\'s name, email, and the instruments they play. This is who you\'ll call for gigs.',
    link: '/dashboard/musicians',
    linkLabel: 'Go to Musicians',
    icon: (
      <svg className="h-12 w-12 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
  },
  {
    title: 'Create a Project',
    content:
      'Projects represent concerts, events, or series. Each project has a name, dates, and status. Think of it as the container for everything related to one gig.',
    link: '/dashboard/projects',
    linkLabel: 'Go to Projects',
    icon: (
      <svg className="h-12 w-12 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
      </svg>
    ),
  },
  {
    title: 'Add Services',
    content:
      'Services are the individual rehearsals and performances within a project. Each service has a call time (when musicians arrive), start time, and end time.',
    icon: (
      <svg className="h-12 w-12 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
      </svg>
    ),
  },
  {
    title: 'Send Calls',
    content:
      'Add positions to your project (e.g., Violin 1 Chair 1), then send calls to musicians. They\'ll receive an email and can accept or decline directly from the link.',
    icon: (
      <svg className="h-12 w-12 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
      </svg>
    ),
  },
  {
    title: 'You\'re All Set!',
    content:
      'That\'s the basic workflow: Musicians \u2192 Project \u2192 Services \u2192 Positions \u2192 Send Calls. You can always come back to the dashboard for a quick overview.',
    icon: (
      <svg className="h-12 w-12 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  },
]

interface SetupWizardProps {
  userId: string
  organizationId: string
}

export function SetupWizard({ userId, organizationId }: SetupWizardProps) {
  const [step, setStep] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  async function completeWizard() {
    const supabase = createClient()
    await supabase
      .from('user_tutorial_state')
      .upsert({
        user_id: userId,
        organization_id: organizationId,
        wizard_completed: true,
        wizard_step: STEPS.length,
      }, { onConflict: 'user_id,organization_id' })
    setDismissed(true)
  }

  if (dismissed) return null

  const currentStep = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-lg mx-4">
        <CardContent className="p-6 space-y-6">
          <div className="flex flex-col items-center text-center space-y-4">
            {currentStep.icon}
            <h2 className="text-xl font-bold">{currentStep.title}</h2>
            <p className="text-muted-foreground">
              {currentStep.content}
            </p>
            {currentStep.link && (
              <a
                href={currentStep.link}
                className="text-primary underline text-sm hover:text-primary/80"
                onClick={(e) => {
                  e.preventDefault()
                  // Don't navigate, just show the link
                }}
              >
                {currentStep.linkLabel}
              </a>
            )}
          </div>

          {/* Step indicators */}
          <div className="flex justify-center gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/30'
                }`}
              />
            ))}
          </div>

          <div className="flex justify-between">
            <Button
              variant="ghost"
              onClick={completeWizard}
            >
              Skip
            </Button>
            <div className="flex gap-2">
              {step > 0 && (
                <Button variant="outline" onClick={() => setStep(step - 1)}>
                  Back
                </Button>
              )}
              {isLast ? (
                <Button onClick={completeWizard}>
                  Get Started
                </Button>
              ) : (
                <Button onClick={() => setStep(step + 1)}>
                  Next
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
