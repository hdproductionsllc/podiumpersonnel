'use client'

import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

export type OfferJoined = {
  id: string
  project_position_id: string
  musician_id: string
  token: string
  status: string
  sent_at: string | null
  expires_at: string | null
  responded_at: string | null
  musician: { id: string; first_name: string; last_name: string }
  position_instrument: string
  position_chair: number
}

interface ProjectOffersProps {
  offers: OfferJoined[]
  canManage: boolean
  onOfferChange: () => void
}

const OFFER_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
  viewed: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  accepted: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  declined: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  expired: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

const OFFER_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  viewed: 'Viewed',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
}

export function ProjectOffers({
  offers,
  canManage,
  onOfferChange,
}: ProjectOffersProps) {
  if (offers.length === 0) return null

  async function handleRevoke(offerId: string) {
    if (!confirm('Revoke this offer?')) return
    const supabase = createClient()
    await supabase.from('contract_offers').delete().eq('id', offerId)
    onOfferChange()
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString()
  }

  function isExpired(expiresAt: string | null): boolean {
    if (!expiresAt) return false
    return new Date(expiresAt) < new Date()
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">Contract Offers</h4>
      <div className="rounded-md border bg-background">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-xs">Musician</th>
              <th className="px-3 py-2 text-left font-medium text-xs">Position</th>
              <th className="px-3 py-2 text-left font-medium text-xs">Status</th>
              <th className="px-3 py-2 text-left font-medium text-xs">Sent</th>
              <th className="px-3 py-2 text-left font-medium text-xs">Expires</th>
              {canManage && (
                <th className="px-3 py-2 text-right font-medium text-xs">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {offers.map((offer) => {
              const expired = isExpired(offer.expires_at)
              const displayStatus = expired && (offer.status === 'pending' || offer.status === 'viewed')
                ? 'expired'
                : offer.status
              return (
                <tr key={offer.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2">
                    {offer.musician.first_name} {offer.musician.last_name}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {offer.position_instrument} {offer.position_chair}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${OFFER_STATUS_COLORS[displayStatus] || ''}`}>
                      {OFFER_STATUS_LABELS[displayStatus] || displayStatus}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDate(offer.sent_at)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDate(offer.expires_at)}
                  </td>
                  {canManage && (
                    <td className="px-3 py-2 text-right">
                      {(offer.status === 'pending' || offer.status === 'viewed') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleRevoke(offer.id)}
                        >
                          Revoke
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
