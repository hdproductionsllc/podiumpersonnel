'use client'

import { useEffect } from 'react'

export function RememberEmail({ email }: { email: string }) {
  useEffect(() => {
    if (email) {
      localStorage.setItem('musician_email', email)
    }
  }, [email])

  return null
}
