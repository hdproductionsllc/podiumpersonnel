import * as Sentry from '@sentry/nextjs'

/**
 * Next.js instrumentation hook. Runs once when a server instance starts and
 * loads the matching Sentry config for the runtime. `onRequestError` is how
 * Next hands us errors thrown inside Server Components, Route Handlers and
 * Server Actions — the ones a try/catch in our code never sees.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
