'use client'

import { createContext, useContext } from 'react'
import type { ResolvedPlan } from '@/lib/plan'

const PlanContext = createContext<ResolvedPlan | null>(null)

export function PlanProvider({
  plan,
  children,
}: {
  plan: ResolvedPlan
  children: React.ReactNode
}) {
  return <PlanContext.Provider value={plan}>{children}</PlanContext.Provider>
}

export function usePlan(): ResolvedPlan {
  const ctx = useContext(PlanContext)
  if (!ctx) {
    throw new Error('usePlan must be used within a PlanProvider')
  }
  return ctx
}
