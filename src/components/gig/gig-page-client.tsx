'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SubRequestForm } from './sub-request-form'

interface Service {
  id: string
  name: string
  service_type: string
  call_time: string | null
  start_time: string
  end_time: string | null
  venue: string | null
  venue_2: string | null
  base_pay: number | null
  leader_fee: number | null
  venue_details?: {
    name: string
    address?: string | null
    city?: string | null
    state?: string | null
    zip?: string | null
    google_maps_url?: string | null
  } | null
  venue_2_details?: {
    name: string
    address?: string | null
    city?: string | null
    state?: string | null
    zip?: string | null
    google_maps_url?: string | null
  } | null
}

interface Instrument {
  id: string
  name: string
}

interface SubRequest {
  id: string
  status: string
  suggested_sub_name: string | null
}

interface GigPageClientProps {
  token: string
  offerId: string
  offerStatus: string
  expiresAt: string | null
  musicianFirstName: string
  organizationName: string
  organizationId: string
  projectName: string
  projectDescription: string | null
  ensembleType: string | null
  projectStartDate: string | null
  projectEndDate: string | null
  instrumentId: string
  instrumentName: string
  services: Service[]
  payAmount: number | null
  timezone: string
  instruments: Instrument[]
  existingSubRequest: SubRequest | null
  musicianHasAccount: boolean
}

export function GigPageClient({
  token,
  offerId,
  offerStatus,
  expiresAt,
  musicianFirstName,
  organizationName,
  organizationId,
  projectName,
  projectDescription,
  ensembleType,
  projectStartDate,
  projectEndDate,
  instrumentId,
  instrumentName,
  services,
  payAmount,
  timezone,
  instruments,
  existingSubRequest,
  musicianHasAccount,
}: GigPageClientProps) {
  const [showSubRequestForm, setShowSubRequestForm] = useState(false)
  const [subRequestSubmitted, setSubRequestSubmitted] = useState(false)
  const [currentSubRequest, setCurrentSubRequest] = useState(existingSubRequest)
  // Tracks which native form is submitting so we can disable both buttons and
  // avoid double-taps on slow mobile connections (the POST does a full redirect).
  const [submitting, setSubmitting] = useState<false | 'accept' | 'decline'>(false)

  const isExpired = expiresAt && new Date(expiresAt) < new Date()
  const canRespond = offerStatus === 'pending' || offerStatus === 'viewed'
  const canRequestSub = offerStatus === 'accepted' && !currentSubRequest && musicianHasAccount

  function handleSubRequestSuccess() {
    setShowSubRequestForm(false)
    setSubRequestSubmitted(true)
    setCurrentSubRequest({
      id: 'new',
      status: 'pending_approval',
      suggested_sub_name: null,
    })
  }

  // Format services for display
  const formattedServices = services.map((service) => ({
    ...service,
    formattedDate: new Date(service.start_time).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: timezone,
    }),
    formattedCallTime: service.call_time
      ? new Date(service.call_time).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: timezone,
        })
      : null,
    formattedTime: new Date(service.start_time).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    }),
    formattedEndTime: service.end_time
      ? new Date(service.end_time).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: timezone,
        })
      : null,
  }))

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 px-3 sm:px-4 py-6 sm:py-8">
      <Card className="w-full max-w-lg">
        <CardHeader className="px-4 sm:px-6">
          <CardTitle className="text-xl sm:text-2xl">Contract Offer</CardTitle>
          <CardDescription className="text-sm">{organizationName}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 sm:space-y-6 px-4 sm:px-6">
          {showSubRequestForm ? (
            <div>
              <h3 className="font-semibold mb-4">Request a Substitute</h3>
              <SubRequestForm
                token={token}
                services={services}
                instruments={instruments}
                currentInstrumentId={instrumentId}
                timezone={timezone}
                onSuccess={handleSubRequestSuccess}
                onCancel={() => setShowSubRequestForm(false)}
              />
            </div>
          ) : (
            <>
              <div>
                <h3 className="font-semibold">Hello, {musicianFirstName}!</h3>
                <p className="text-muted-foreground">
                  You have been invited to perform with {organizationName}.
                </p>
              </div>

              <div className="space-y-2 text-sm sm:text-base">
                <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-2">
                  <span className="text-muted-foreground text-xs sm:text-sm">Project</span>
                  <span className="font-medium">{projectName}</span>
                </div>
                {ensembleType && (
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-2">
                    <span className="text-muted-foreground text-xs sm:text-sm">Ensemble</span>
                    <span className="font-medium">{ensembleType}</span>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-2">
                  <span className="text-muted-foreground text-xs sm:text-sm">Position</span>
                  <span className="font-medium">{instrumentName}</span>
                </div>
                {services.length > 0 ? (
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-2">
                    <span className="text-muted-foreground text-xs sm:text-sm">Date{services.length > 1 ? 's' : ''}</span>
                    <span className="font-medium">
                      {services.length === 1
                        ? new Date(services[0].start_time).toLocaleDateString('en-US', { timeZone: timezone })
                        : `${new Date(services[0].start_time).toLocaleDateString('en-US', { timeZone: timezone })} - ${new Date(services[services.length - 1].start_time).toLocaleDateString('en-US', { timeZone: timezone })}`}
                    </span>
                  </div>
                ) : (
                  projectStartDate && (
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-2">
                      <span className="text-muted-foreground text-xs sm:text-sm">Date</span>
                      <span className="font-medium">
                        {new Date(projectStartDate + 'T12:00:00').toLocaleDateString('en-US')}
                        {projectEndDate &&
                          projectEndDate !== projectStartDate &&
                          ` - ${new Date(projectEndDate + 'T12:00:00').toLocaleDateString('en-US')}`}
                      </span>
                    </div>
                  )
                )}
                {payAmount != null && (
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-2">
                    <span className="text-muted-foreground text-xs sm:text-sm">Pay</span>
                    <span className="font-medium text-lg sm:text-base text-green-600 dark:text-green-400">${payAmount}</span>
                  </div>
                )}
              </div>

              {formattedServices.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2 text-sm sm:text-base">Schedule</h4>
                  <div className="space-y-2">
                    {formattedServices.map((service) => (
                      <div key={service.id} className="text-xs sm:text-sm bg-muted/50 rounded-md p-2.5 sm:p-3">
                        <div className="flex flex-wrap items-baseline gap-1">
                          <span className="font-medium">{service.name}</span>
                          <span className="text-muted-foreground text-xs">
                            ({service.service_type})
                          </span>
                        </div>
                        <div className="text-muted-foreground mt-1">
                          {service.formattedDate}
                        </div>
                        <div className="text-muted-foreground">
                          {service.formattedCallTime && `Call: ${service.formattedCallTime} | `}
                          Start: {service.formattedTime}
                          {service.formattedEndTime && ` | End: ${service.formattedEndTime}`}
                        </div>
                        {service.venue && (
                          <div className="text-muted-foreground mt-1 flex items-start gap-1">
                            <svg className="h-3 w-3 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                            </svg>
                            {(() => {
                              const v = service.venue_details
                              const display = v
                                ? [v.name, v.address, v.city, v.state].filter(Boolean).join(', ')
                                : service.venue
                              const mapsUrl = v?.google_maps_url
                                || (v
                                  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([v.name, v.address, v.city, v.state, v.zip].filter(Boolean).join(', '))}`
                                  : null)
                              return mapsUrl ? (
                                <a
                                  href={mapsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary underline hover:text-primary/80"
                                >
                                  {display}
                                </a>
                              ) : <span>{display}</span>
                            })()}
                          </div>
                        )}
                        {(service.venue_2 || service.venue_2_details) && (
                          <div className="text-muted-foreground mt-1 flex items-start gap-1">
                            <svg className="h-3 w-3 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                            </svg>
                            {(() => {
                              const v = service.venue_2_details
                              const display = v
                                ? [v.name, v.address, v.city, v.state].filter(Boolean).join(', ')
                                : service.venue_2!
                              const mapsUrl = v?.google_maps_url
                                || (v
                                  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([v.name, v.address, v.city, v.state, v.zip].filter(Boolean).join(', '))}`
                                  : null)
                              return mapsUrl ? (
                                <a
                                  href={mapsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary underline hover:text-primary/80"
                                >
                                  {display}
                                </a>
                              ) : <span>{display}</span>
                            })()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {projectDescription && (
                <div>
                  <h4 className="font-medium mb-1">Notes</h4>
                  <p className="text-sm text-muted-foreground">{projectDescription}</p>
                </div>
              )}

              {offerStatus === 'accepted' && (
                <div className="space-y-3">
                  <div className="rounded-md bg-green-50 dark:bg-green-950 p-4 text-green-800 dark:text-green-200">
                    You have accepted this offer.
                  </div>

                  {/* Sub request status */}
                  {currentSubRequest && (
                    <div
                      className={`rounded-md p-4 ${
                        currentSubRequest.status === 'pending_approval'
                          ? 'bg-yellow-50 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200'
                          : currentSubRequest.status === 'approved'
                            ? 'bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-200'
                            : currentSubRequest.status === 'filled'
                              ? 'bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200'
                              : currentSubRequest.status === 'declined' || currentSubRequest.status === 'sub_declined'
                                ? 'bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200'
                                : 'bg-muted'
                      }`}
                    >
                      {currentSubRequest.status === 'pending_approval' && (
                        <>Your sub request is pending admin approval.</>
                      )}
                      {currentSubRequest.status === 'approved' && (
                        <>
                          Your sub request was approved. We&apos;re contacting{' '}
                          {currentSubRequest.suggested_sub_name || 'your suggested substitute'}.
                        </>
                      )}
                      {currentSubRequest.status === 'filled' && (
                        <>Your substitute has been confirmed. You are released from this engagement.</>
                      )}
                      {currentSubRequest.status === 'declined' && (
                        <>
                          Your sub request was declined. Please find another substitute.
                        </>
                      )}
                      {currentSubRequest.status === 'sub_declined' && (
                        <>
                          Your suggested substitute declined. Please find another substitute.
                        </>
                      )}
                    </div>
                  )}

                  {subRequestSubmitted && !currentSubRequest && (
                    <div className="rounded-md bg-blue-50 dark:bg-blue-950 p-4 text-blue-800 dark:text-blue-200">
                      Your sub request has been submitted and is pending approval.
                    </div>
                  )}

                  {(services.length > 0 || projectStartDate) && !currentSubRequest?.status?.includes('filled') && (
                    <div className="flex flex-col gap-2">
                      <a
                        href={`/api/offers/${offerId}/calendar?format=google&token=${token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 sm:py-2 text-sm sm:text-base text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-transform"
                      >
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                          />
                        </svg>
                        Add to Google Calendar
                      </a>
                      <a
                        href={`/api/offers/${offerId}/calendar?token=${token}`}
                        download
                        className="flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-3 sm:py-2 text-xs sm:text-sm hover:bg-muted active:scale-[0.98] transition-transform"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        Download .ics (Outlook, Apple)
                      </a>
                    </div>
                  )}

                  {/* Request Sub button - only show if accepted and no pending/approved request */}
                  {canRequestSub && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setShowSubRequestForm(true)}
                    >
                      Request a Substitute
                    </Button>
                  )}

                  {/* Allow new sub request if previous was declined */}
                  {currentSubRequest &&
                    (currentSubRequest.status === 'declined' || currentSubRequest.status === 'sub_declined') && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          setCurrentSubRequest(null)
                          setShowSubRequestForm(true)
                        }}
                      >
                        Submit New Sub Request
                      </Button>
                    )}
                </div>
              )}

              {offerStatus === 'declined' && (
                <div className="rounded-md bg-red-50 dark:bg-red-950 p-4 text-red-800 dark:text-red-200">
                  You have declined this offer.
                </div>
              )}

              {offerStatus === 'rescinded' && (
                <div className="rounded-md bg-amber-50 dark:bg-amber-950 p-4 text-amber-800 dark:text-amber-200">
                  This offer was withdrawn by the organization. No response is needed.
                </div>
              )}

              {/* Portal link - shown after responding */}
              {(offerStatus === 'accepted' || offerStatus === 'declined' || offerStatus === 'rescinded') && (
                <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4">
                  {musicianHasAccount ? (
                    <>
                      <h4 className="font-medium text-blue-900 dark:text-blue-100 text-sm">Musician Portal</h4>
                      <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                        View your schedule, manage offers, update your profile, and more.
                      </p>
                      <a
                        href="/musician"
                        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                        </svg>
                        Go to Musician Portal
                      </a>
                    </>
                  ) : (
                    <>
                      <h4 className="font-medium text-blue-900 dark:text-blue-100 text-sm">Manage all your gigs in one place</h4>
                      <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                        Create a free Podium account to view upcoming services, manage your schedule, respond to future calls faster, and request substitutes if needed.
                      </p>
                      <a
                        href="/musician/register"
                        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                        </svg>
                        Create Your Account
                      </a>
                    </>
                  )}
                </div>
              )}

              {isExpired && canRespond && (
                <div className="rounded-md bg-yellow-50 dark:bg-yellow-950 p-4 text-yellow-800 dark:text-yellow-200">
                  This offer has expired.
                </div>
              )}

              {canRespond && !isExpired && (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground text-center px-2">
                    By accepting this offer, you agree to our{' '}
                    <a
                      href={`/musician-policy?org=${organizationId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline hover:text-primary/80"
                    >
                      Musician Policy
                    </a>
                    .
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <form
                      action={`/api/gig/${token}/accept`}
                      method="POST"
                      className="flex-1"
                      onSubmit={() => setSubmitting('accept')}
                    >
                      <Button
                        type="submit"
                        disabled={submitting !== false}
                        className="w-full h-12 sm:h-10 text-base sm:text-sm font-semibold"
                      >
                        {submitting === 'accept' ? 'Accepting…' : 'Accept Offer'}
                      </Button>
                    </form>
                    <form
                      action={`/api/gig/${token}/decline`}
                      method="POST"
                      className="flex-1"
                      onSubmit={() => setSubmitting('decline')}
                    >
                      <Button
                        type="submit"
                        variant="outline"
                        disabled={submitting !== false}
                        className="w-full h-11 sm:h-10 text-base sm:text-sm"
                      >
                        {submitting === 'decline' ? 'Declining…' : 'Decline'}
                      </Button>
                    </form>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
