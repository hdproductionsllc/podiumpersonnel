'use client'

import { useEffect } from 'react'
import { DASHBOARD_SCROLLER_ID, RELOAD_SCROLL_KEY } from '@/lib/reload-page'

/** After reloadPage(), put the dashboard back at the scroll spot it left. */
export function ReloadScrollRestore() {
  useEffect(() => {
    let saved: { path: string; top: number } | null = null
    try {
      const raw = sessionStorage.getItem(RELOAD_SCROLL_KEY)
      sessionStorage.removeItem(RELOAD_SCROLL_KEY)
      saved = raw ? JSON.parse(raw) : null
    } catch {
      return
    }
    if (!saved || saved.path !== window.location.pathname + window.location.search) return
    const top = saved.top
    // Let pages re-open what was open (projects page) before scrolling.
    const timer = setTimeout(() => {
      document.getElementById(DASHBOARD_SCROLLER_ID)?.scrollTo({ top })
    }, 150)
    return () => clearTimeout(timer)
  }, [])
  return null
}
