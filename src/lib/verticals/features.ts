import type { VerticalTemplate } from './types'

/**
 * Per-vertical feature predicates, mirroring the plan.ts gate style.
 * Plan gates answer "may this org use this (billing)?"; vertical gates answer
 * "does this concept exist for this kind of organization?". They compose.
 */

export function canUseChairs(v: VerticalTemplate): boolean {
  return v.features.useChairs
}

export function canInferTitles(v: VerticalTemplate): boolean {
  return v.features.useTitleInference
}

export function canDetectEnsembles(v: VerticalTemplate): boolean {
  return v.features.useEnsembleDetection
}

export function showBooksTab(v: VerticalTemplate): boolean {
  return v.features.showBooksTab
}
