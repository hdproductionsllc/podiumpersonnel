import { toast } from 'sonner'

/**
 * Show a toast for an API response. Handles both ok and error cases.
 * Returns the parsed JSON body.
 */
export async function toastFromResponse(
  response: Response,
  options?: { successMessage?: string }
): Promise<Record<string, unknown>> {
  const data = await response.json()

  if (!response.ok) {
    toast.error(data.error || data.message || 'Something went wrong')
    throw new ApiError(data.error || 'Request failed', response.status)
  }

  if (options?.successMessage) {
    toast.success(options.successMessage)
  }

  return data
}

/**
 * Wraps an async action with consistent error toasting.
 * Returns the result or undefined on failure.
 */
export async function withToast<T>(
  fn: () => Promise<T>,
  options?: { errorMessage?: string }
): Promise<T | undefined> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof ApiError) return undefined // already toasted
    const message =
      options?.errorMessage ||
      (err instanceof Error ? err.message : 'Something went wrong')
    toast.error(message)
    return undefined
  }
}

class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}
