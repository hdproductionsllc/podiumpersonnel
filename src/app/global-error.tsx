'use client'

import { useEffect } from 'react'
import { SUPPORT_EMAIL, supportMailto } from '@/lib/constants'

/**
 * Last-resort boundary for crashes in the root layout itself. Next renders this
 * INSTEAD of the root layout, so it must provide its own <html>/<body> and can't
 * rely on app styles/components.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Root layout error:', error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#fff',
          color: '#0f172a',
          padding: '1rem',
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ marginTop: '0.5rem', color: '#64748b' }}>
            An unexpected error occurred. Your data is safe — try refreshing the page.
          </p>
          {error.digest && (
            <p style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#94a3b8' }}>
              Error ID: {error.digest}
            </p>
          )}
          <div style={{ marginTop: '1.5rem' }}>
            <button
              onClick={reset}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: 6,
                border: 'none',
                background: '#0f172a',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
          <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#64748b' }}>
            Still stuck? Email{' '}
            <a
              href={supportMailto(
                error.digest ? `Help with Podium (error ${error.digest})` : 'Help with Podium'
              )}
              style={{ color: '#0f172a', textDecoration: 'underline' }}
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
        </div>
      </body>
    </html>
  )
}
