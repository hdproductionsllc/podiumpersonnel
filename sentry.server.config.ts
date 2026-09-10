import * as Sentry from '@sentry/nextjs'

/**
 * Server-side error monitoring. Loaded once per Node.js server instance by
 * src/instrumentation.ts.
 *
 * Inert until NEXT_PUBLIC_SENTRY_DSN is set: with no DSN the SDK is disabled
 * and nothing leaves the box, so a deploy without the env var behaves exactly
 * as before. Errors only — no performance tracing, no PII.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  tracesSampleRate: 0,
  sendDefaultPii: false,
})
