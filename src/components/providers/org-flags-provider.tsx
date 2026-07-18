'use client'

import { createContext, useContext } from 'react'

export type OrgFlags = { intakeEnabled: boolean }

const OrgFlagsContext = createContext<OrgFlags | null>(null)

export function OrgFlagsProvider({
  flags,
  children,
}: {
  flags: OrgFlags
  children: React.ReactNode
}) {
  return <OrgFlagsContext.Provider value={flags}>{children}</OrgFlagsContext.Provider>
}

export function useOrgFlags(): OrgFlags {
  const ctx = useContext(OrgFlagsContext)
  if (!ctx) {
    throw new Error('useOrgFlags must be used within an OrgFlagsProvider')
  }
  return ctx
}
