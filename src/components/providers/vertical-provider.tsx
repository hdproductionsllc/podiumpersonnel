'use client'

import { createContext, useContext, useMemo } from 'react'
import { resolveVertical } from '@/lib/verticals'
import type { TermDictionary, VerticalTemplate } from '@/lib/verticals'

const VerticalContext = createContext<VerticalTemplate | null>(null)

/**
 * Mirrors PlanProvider, but receives only the vertical KEY from the server
 * layout (templates contain functions, which can't cross the server→client
 * boundary) and resolves the full template client-side. A null key (column
 * not migrated yet, fetch error) resolves to the default template.
 */
export function VerticalProvider({
  verticalKey,
  children,
}: {
  verticalKey: string | null
  children: React.ReactNode
}) {
  const vertical = useMemo(() => resolveVertical(verticalKey), [verticalKey])
  return <VerticalContext.Provider value={vertical}>{children}</VerticalContext.Provider>
}

export function useVertical(): VerticalTemplate {
  const ctx = useContext(VerticalContext)
  if (!ctx) {
    throw new Error('useVertical must be used within a VerticalProvider')
  }
  return ctx
}

export function useTerms(): TermDictionary {
  return useVertical().terms
}
