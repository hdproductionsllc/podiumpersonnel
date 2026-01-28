'use client'

import { X } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface ImpersonationBannerProps {
  musicianName: string
  organizationName: string
}

export function ImpersonationBanner({ musicianName, organizationName }: ImpersonationBannerProps) {
  const router = useRouter()

  function exitImpersonation() {
    // Navigate to musician list without impersonation
    router.push('/dashboard/musicians')
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 px-4 py-2">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
          <span>
            Viewing portal as <strong>{musicianName}</strong>
            {organizationName && <span className="text-amber-800"> ({organizationName})</span>}
          </span>
        </div>
        <button
          onClick={exitImpersonation}
          className="flex items-center gap-1 text-sm font-medium hover:bg-amber-600 rounded px-2 py-1 transition-colors"
        >
          <X className="h-4 w-4" />
          Exit
        </button>
      </div>
    </div>
  )
}
