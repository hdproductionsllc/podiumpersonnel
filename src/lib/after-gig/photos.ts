export const PHOTO_BUCKET = 'gig-report-photos'
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024
export const MAX_PHOTOS = 10
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function photoPrefix(report: { organizationId: string; projectId: string; reportId: string }) {
  return `${report.organizationId}/${report.projectId}/${report.reportId}`
}
