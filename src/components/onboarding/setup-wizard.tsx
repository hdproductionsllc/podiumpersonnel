'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Logo } from '@/components/ui/logo'
import { useTerms } from '@/components/providers/vertical-provider'
import { term } from '@/lib/verticals'
import type { TermDictionary } from '@/lib/verticals'

function SidebarTab({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 border border-primary/20 px-2.5 py-1 text-sm font-semibold text-primary">
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
      </svg>
      {label}
    </span>
  )
}

function getSteps(terms: TermDictionary) {
  return [
  {
    title: 'Welcome to Podium Personnel!',
    body: (
      <p className="text-muted-foreground">
        Your orchestral {term(terms, 'skill', { plural: true, case: 'lower' })} are already pre-loaded. Here&apos;s a quick overview of how Podium works to help you manage your personnel.
      </p>
    ),
    icon: <Logo variant="dark" size="md" />,
  },
  {
    title: 'Build Your Roster & Set Your Call Order',
    body: (
      <div className="space-y-3">
        <p className="text-muted-foreground">
          Import a spreadsheet or add {term(terms, 'person', { plural: true, case: 'lower' })} one by one — names and {term(terms, 'skill', { plural: true, case: 'lower' })} are all you need to get started. Emails, phones, and other details can always come later.
        </p>
        <p className="text-muted-foreground">
          Then set your <strong>call order</strong> — rank your {term(terms, 'person', { plural: true, case: 'lower' })} by preference so Podium always knows who to call first. When a gig opens up, your top picks get the offer automatically.
        </p>
        <div className="pt-1">
          <span className="text-xs text-muted-foreground">Find it in the sidebar:</span>{' '}
          <SidebarTab label={term(terms, 'person', { plural: true })} />
        </div>
      </div>
    ),
    icon: (
      <svg className="h-12 w-12 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
  },
  {
    title: `Create ${term(terms, 'work', { plural: true })} & ${term(terms, 'session', { plural: true })}`,
    body: (
      <div className="space-y-3">
        <p className="text-muted-foreground">
          A <strong>{term(terms, 'work', { case: 'lower' })}</strong> is the container for a gig — it could be a full concert series with multiple rehearsals and performances, or just a single casual event.
        </p>
        <p className="text-muted-foreground">
          Inside each {term(terms, 'work', { case: 'lower' })}, you add <strong>{term(terms, 'session', { plural: true, case: 'lower' })}</strong> — the individual rehearsals and performances your {term(terms, 'person', { plural: true, case: 'lower' })} need to show up for, each with a call time, start time, and end time.
        </p>
        <div className="rounded-md bg-muted/50 border px-3 py-2 text-sm text-left">
          <div className="font-semibold">Holiday Concert</div>
          <div className="ml-4 mt-1 space-y-0.5 text-muted-foreground text-xs">
            <div>Rehearsal — Dec 18, 7:00 PM</div>
            <div>Dress Rehearsal — Dec 19, 6:30 PM</div>
            <div>Performance — Dec 20, 7:00 PM</div>
          </div>
        </div>
        <div className="pt-1">
          <span className="text-xs text-muted-foreground">Find it in the sidebar:</span>{' '}
          <SidebarTab label={term(terms, 'work', { plural: true })} />
        </div>
      </div>
    ),
    icon: (
      <svg className="h-12 w-12 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
      </svg>
    ),
  },
  {
    title: 'Staff & Send Calls',
    body: (
      <div className="space-y-3">
        <p className="text-muted-foreground">
          Still inside the <SidebarTab label={term(terms, 'work', { plural: true })} /> tab, add positions to your {term(terms, 'work', { case: 'lower' })} — like <strong>Violin 1</strong>, <strong>Cello</strong>, or <strong>Trumpet</strong> — and send calls to your {term(terms, 'person', { plural: true, case: 'lower' })}. Podium will automatically suggest players who are higher on your call list.
        </p>
        <p className="text-muted-foreground">
          {term(terms, 'person', { plural: true })} receive an email and can accept or decline directly from the link — no account required.
        </p>
      </div>
    ),
    icon: (
      <svg className="h-12 w-12 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
      </svg>
    ),
  },
  {
    title: 'You\'re All Set!',
    body: (
      <p className="text-muted-foreground">
        That&apos;s the workflow: <strong>{term(terms, 'person', { plural: true })}</strong> &rarr; <strong>{term(terms, 'work')}</strong> &rarr; <strong>{term(terms, 'session', { plural: true })}</strong> &rarr; <strong>Staff</strong> &rarr; <strong>Send Calls</strong>. Your dashboard will guide you through what to do next.
      </p>
    ),
    icon: (
      <svg className="h-12 w-12 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  },
  ]
}

interface SetupWizardProps {
  userId: string
  organizationId: string
}

export function SetupWizard({ userId, organizationId }: SetupWizardProps) {
  const terms = useTerms()
  const STEPS = getSteps(terms)
  const [step, setStep] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  async function completeWizard() {
    const supabase = createClient()
    const { error: saveError } = await supabase
      .from('user_tutorial_state')
      .upsert({
        user_id: userId,
        organization_id: organizationId,
        wizard_completed: true,
        wizard_step: STEPS.length,
      }, { onConflict: 'user_id,organization_id' })
    // Worst case the wizard shows again next visit — never block dismissing it.
    if (saveError) console.warn('setup-wizard: could not save wizard completion:', saveError)
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
            {currentStep.body}
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
