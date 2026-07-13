'use client'

import { useTerms } from '@/components/providers/vertical-provider'
import { term } from '@/lib/verticals'

interface EmailPreviewProps {
  organizationName: string
  logoUrl?: string
  brandColor: string
  footerText?: string
}

export function EmailPreview({
  organizationName,
  logoUrl,
  brandColor,
  footerText,
}: EmailPreviewProps) {
  const terms = useTerms()
  return (
    <div className="border rounded-lg overflow-hidden bg-gray-100">
      <div className="max-w-[600px] mx-auto bg-white shadow-sm">
        {/* Header */}
        <div
          className="p-6 text-center"
          style={{ backgroundColor: brandColor }}
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={organizationName}
              className="h-12 mx-auto object-contain"
              style={{ maxWidth: '200px' }}
            />
          ) : (
            <h1 className="text-white text-xl font-bold">{organizationName}</h1>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-gray-700 mb-4">Dear {term(terms, 'person')} Name,</p>

          <p className="text-gray-600 text-sm mb-4">
            You have been offered a position with{' '}
            <strong>{organizationName}</strong> for the following {term(terms, 'work', { case: 'lower' })}:
          </p>

          <div className="bg-gray-50 border rounded-lg p-4 mb-4">
            <h2 className="font-bold text-gray-900 mb-2">Sample {term(terms, 'work')} Name</h2>
            <p className="text-gray-600 text-sm">
              <strong>Position:</strong> Violin 1, {term(terms, 'rank')} 1
            </p>
            <p className="text-gray-600 text-sm">
              <strong>Please respond by:</strong> January 31, 2025
            </p>
          </div>

          <h3 className="font-bold text-gray-900 text-sm mb-2">{term(terms, 'session', { plural: true })}:</h3>
          <div
            className="bg-gray-50 border-l-4 p-3 mb-4"
            style={{ borderLeftColor: brandColor }}
          >
            <p className="font-bold text-gray-900 text-sm">Rehearsal 1</p>
            <p className="text-gray-600 text-xs">February 1, 2025 at 7:00 PM</p>
            <p className="text-gray-500 text-xs">Concert Hall</p>
          </div>

          <div className="text-center my-6">
            <button
              className="px-6 py-3 text-white font-bold rounded-md text-sm"
              style={{ backgroundColor: brandColor }}
            >
              View & Respond to Offer
            </button>
          </div>

          <p className="text-gray-400 text-xs text-center">
            Click the button above to view the full details and accept or decline this offer.
          </p>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 bg-gray-50">
          {footerText && (
            <p className="text-gray-600 text-xs text-center mb-2">{footerText}</p>
          )}
          <p className="text-gray-400 text-xs text-center">
            This email was sent by {organizationName} via Podium.
          </p>
          <p className="text-gray-400 text-xs text-center">
            If you have questions, please contact the organization directly.
          </p>
        </div>
      </div>
    </div>
  )
}
