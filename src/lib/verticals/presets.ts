import type { ServiceType } from '@/lib/validations/projects'
import type { VerticalTemplate } from './types'

/** One service a preset creates, in the org's wall-clock time (the caller converts). */
export type PresetService = {
  name: string
  service_type: ServiceType
  /** YYYY-MM-DD */
  date: string
  /** HH:mm */
  start: string
  end: string
  call: string
}

/**
 * The "Three-call show" preset: Load-in, Show Day and Strike. Services only;
 * the crew is added role by role afterwards (Add crew). On a one-day show all
 * three calls fall on that day; on a multi-day show the load-in is on the
 * first day and the show and strike on the last. No date: nothing is created,
 * the same as every other preset.
 */
export function threeCallShowServices(
  showName: string,
  startDate: string | null | undefined,
  endDate: string | null | undefined
): PresetService[] {
  const multiDay = !!startDate && !!endDate && startDate !== endDate
  if (multiDay) {
    return [
      { name: `${showName} Load-in`, service_type: 'load_in', date: startDate!, start: '07:00', end: '15:00', call: '06:30' },
      { name: `${showName} Show Day`, service_type: 'show_call', date: endDate!, start: '06:00', end: '22:00', call: '05:30' },
      { name: `${showName} Strike`, service_type: 'strike', date: endDate!, start: '22:00', end: '23:59', call: '22:00' },
    ]
  }
  const day = startDate || endDate
  if (!day) return []
  return [
    { name: `${showName} Load-in`, service_type: 'load_in', date: day, start: '06:00', end: '10:00', call: '05:30' },
    { name: `${showName} Show Day`, service_type: 'show_call', date: day, start: '10:00', end: '22:00', call: '09:30' },
    { name: `${showName} Strike`, service_type: 'strike', date: day, start: '22:00', end: '23:59', call: '22:00' },
  ]
}

/**
 * The leader fee a NEW service is written with. Where the vertical has a
 * leader fee this adds nothing, so the insert is exactly what it always was
 * (the column's database default, 50, applies). Where it has none, 0: every
 * reader treats 0 as "no leader fee", while null would read as the old $50
 * default (`leader_fee ?? 50`).
 */
export function leaderFeeForNewService(vertical: VerticalTemplate): { leader_fee?: number } {
  return vertical.features.useLeaderFee ? {} : { leader_fee: 0 }
}

/**
 * What the main session is called when a preset names it after its type:
 * "Performance" for the music verticals (the name every blank gig has always
 * been given), "Show" for a production crew.
 */
export function mainSessionLabel(vertical: VerticalTemplate): string {
  return vertical.sessionTypes.find((t) => t.key === vertical.mainSessionType)?.label ?? 'Performance'
}
