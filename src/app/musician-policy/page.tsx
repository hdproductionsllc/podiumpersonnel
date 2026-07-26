import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { createServiceClient } from '@/lib/supabase/server'
import { getOrgVertical } from '@/lib/api-helpers'
import { term, DEFAULT_TERMS } from '@/lib/verticals'

const DEFAULT_POLICY = `## Acceptance of Engagement

By accepting a contract offer through Podium Personnel, you agree to perform the services outlined in the offer, including all rehearsals and performances listed. Please review all dates, times, and locations carefully before accepting.

## Cancellation Policy

If you are unable to fulfill your commitment after accepting an offer, please notify the organization as soon as possible. Repeated cancellations may affect your standing for future engagements.

## Punctuality

Musicians are expected to arrive at least 30 minutes before the scheduled start time for all services. If you anticipate being late or unable to attend, contact the personnel manager immediately.

## Professional Conduct

All musicians are expected to maintain professional conduct during rehearsals and performances. This includes appropriate attire as specified by the organization, preparedness with required music and equipment, and respectful interaction with fellow musicians and staff.

## Payment

Payment will be processed according to the terms specified in your offer. If your payment or contact details have changed, let the personnel manager know and they will update your record.

## Questions

If you have any questions about a specific engagement or this policy, please contact the organization's personnel manager directly.`

interface MusicianPolicyPageProps {
  searchParams: Promise<{ org?: string }>
}

export default async function MusicianPolicyPage({ searchParams }: MusicianPolicyPageProps) {
  const { org: orgId } = await searchParams

  let organizationName = 'Podium Personnel'
  let policyContent = DEFAULT_POLICY
  // The heading follows the org's vertical, so a theatre company sees
  // "Performer Policy" rather than "Musician Policy". Defaults reproduce the
  // music wording exactly.
  let terms = DEFAULT_TERMS

  if (orgId) {
    const supabase = createServiceClient()
    const { data: organization } = await supabase
      .from('organizations')
      .select('name, musician_policy')
      .eq('id', orgId)
      .single()

    if (organization) {
      organizationName = organization.name
      terms = (await getOrgVertical(orgId)).terms
      if (organization.musician_policy) {
        policyContent = organization.musician_policy
      }
    }
  }

  // Simple markdown-like rendering for the policy content
  const renderPolicy = (content: string) => {
    const sections = content.split(/^## /gm).filter(Boolean)

    return sections.map((section, index) => {
      const lines = section.trim().split('\n')
      const title = lines[0]
      const body = lines.slice(1).join('\n').trim()

      return (
        <section key={index}>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-muted-foreground whitespace-pre-wrap">{body}</p>
        </section>
      )
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 px-4 py-8">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl">{term(terms, 'person')} Policy</CardTitle>
          <CardDescription>{organizationName}</CardDescription>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-4">
          {renderPolicy(policyContent)}
        </CardContent>
      </Card>
    </div>
  )
}
