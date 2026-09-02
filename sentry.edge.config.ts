import * as Sentry from '@sentry/nextjs'

/** Edge-runtime twin of sentry.server.config.ts (middleware/proxy). */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  tracesSampleRate: 0,
  sendDefaultPii: false,
})
