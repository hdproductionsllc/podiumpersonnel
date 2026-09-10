import * as Sentry from '@sentry/nextjs'

/**
 * Browser-side error monitoring. Same rule as the server config: disabled
 * until NEXT_PUBLIC_SENTRY_DSN is set. Errors only — no session replay, no
 * performance tracing, no PII.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  sendDefaultPii: false,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
