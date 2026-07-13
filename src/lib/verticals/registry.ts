import { musicContractor } from './templates/music-contractor'
import { orchestraBand } from './templates/orchestra-band'
import { choir } from './templates/choir'
import { theatre } from './templates/theatre'
import { dance } from './templates/dance'
import { churchWorship } from './templates/church-worship'
import { eventAgency } from './templates/event-agency'
import type { VerticalKey, VerticalTemplate } from './types'

export const DEFAULT_VERTICAL: VerticalKey = 'music_contractor'

export const VERTICALS: Record<VerticalKey, VerticalTemplate> = {
  music_contractor: musicContractor,
  orchestra_band: orchestraBand,
  choir,
  theatre,
  dance,
  church_worship: churchWorship,
  event_agency: eventAgency,
}

/**
 * Resolve an organization's vertical template. NEVER throws: null, undefined,
 * or an unknown key (column not yet migrated, manual dashboard edit, future
 * key on old code) all resolve to the default template — which reproduces the
 * pre-verticals UI exactly. This fallback is what makes every deploy safe
 * regardless of migration order.
 */
export function resolveVertical(key: string | null | undefined): VerticalTemplate {
  if (key && Object.hasOwn(VERTICALS, key)) {
    return VERTICALS[key as VerticalKey]
  }
  return VERTICALS[DEFAULT_VERTICAL]
}

/**
 * Default terminology (the music_contractor dictionary). Server-rendered email
 * templates take an optional `terms?: TermDictionary` prop and fall back to
 * this, so a template rendered without terms produces today's exact wording.
 */
export const DEFAULT_TERMS = VERTICALS[DEFAULT_VERTICAL].terms
