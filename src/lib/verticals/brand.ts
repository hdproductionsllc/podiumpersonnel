import type { VerticalBrand, VerticalTemplate } from './types'

/**
 * The product name shown in the wordmark, the browser tab and the
 * worker-facing email footers.
 *
 * Podium is the default for every vertical. A template may carry its own
 * brand so one deployment can wear a second name for a second market (the
 * production_crew vertical shows as "Overhire"). This is the only place a
 * brand is decided.
 *
 * The email footer takes `vertical.brand` itself (undefined for Podium), so a
 * Podium footer keeps its own tracked link byte for byte.
 */
export const DEFAULT_BRAND: VerticalBrand = {
  name: 'Podium',
  url: 'https://www.podiumpersonnel.com',
}

export function brandFor(vertical: VerticalTemplate | null | undefined): VerticalBrand {
  return vertical?.brand ?? DEFAULT_BRAND
}

/** The browser tab title: today's "Podium Personnel", or the vertical's brand name. */
export function productTitleFor(vertical: VerticalTemplate | null | undefined): string {
  return vertical?.brand?.name ?? 'Podium Personnel'
}
