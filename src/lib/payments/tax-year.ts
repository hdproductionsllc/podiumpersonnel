/** Verified against IRS Publication 1099 (2026), 2026-10-26. Review annually. */
export function reportingThreshold(year: number): number | null {
  if (!Number.isInteger(year) || year < 2020) return null
  if (year <= 2025) return 600
  return year === 2026 ? 2000 : null
}

/** Payment date is a calendar date, not a browser-local timestamp. Never substitute creation time. */
export function paymentTaxYear(date: string | null): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date) || Number.isNaN(Date.parse(date))) return null
  return Number(date.slice(0, 4))
}

/** January 31, advanced over weekends. Check applicable holidays/extensions separately. */
export function necDueDate(year: number): string {
  const date = new Date(Date.UTC(year + 1, 0, 31))
  while ([0, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}
