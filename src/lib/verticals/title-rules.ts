import { getPositionTitle } from '@/lib/orchestra-positions'
import { checkEnsembleDrift } from '@/lib/ensemble-detection'
import type { TermForms, TitleRules } from './types'

/**
 * The original orchestral logic, untouched — music verticals must behave
 * byte-identically to the pre-verticals app (vertical-identity.test.ts
 * compares against the source functions directly).
 */
export const orchestralTitleRules: TitleRules = {
  getPositionTitle,
  checkGroupDrift: checkEnsembleDrift,
}

/**
 * Non-music verticals: the skill name (Role, Voice Part, …) already IS the
 * position, so no title inference. With a rank the title is "Rank N";
 * without one, titles are empty and drift detection is inert (drift is a
 * chamber-music concept).
 */
export function plainTitleRules(rank: TermForms | null): TitleRules {
  return {
    getPositionTitle: (_instrumentName, chairNumber) =>
      rank
        ? {
            title: `${rank.singular} ${chairNumber}`,
            shortTitle: `${chairNumber}`,
            isLeadership: chairNumber === 1,
          }
        : { title: '', shortTitle: '', isLeadership: false },
    checkGroupDrift: () => ({ drifted: false, suggestion: null }),
  }
}
