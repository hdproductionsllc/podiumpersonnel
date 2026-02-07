import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Default timezone when an organization has no timezone configured */
export const DEFAULT_TIMEZONE = 'America/Los_Angeles'

/** Default brand color for email templates */
export const DEFAULT_BRAND_COLOR = '#1E293B'

/** Base URL for the application, used in emails and links */
export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}
