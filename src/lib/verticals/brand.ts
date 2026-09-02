import type { VerticalBrand, VerticalTemplate } from './types'

/**
 * The product name shown in the wordmark, the browser tab and email footers.
 *
 * Podium is the default for every vertical. A template may carry its own
 * brand so one deployment can wear a second name for a second market (the
 * production-crew vertical shows as "Overhire"). Nothing else about the
 * engine changes; this is deliberately the only place a brand is decided.
 */
export const DEFAULT_BRAND: VerticalBrand = {
  name: 'Podium',
  url: 'https://www.podiumpersonnel.com',
}

export function brandFor(vertical: VerticalTemplate | null | undefined): VerticalBrand {
  return vertical?.brand ?? DEFAULT_BRAND
}
