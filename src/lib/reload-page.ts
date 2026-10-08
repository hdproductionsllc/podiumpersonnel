/**
 * Show the admin what they just changed: reload the page from the server.
 *
 * The dashboard used router.refresh() for this. On Next 16.3 it can silently
 * do nothing (no request is made and the old screen stays), so Subito added a
 * chair, saw nothing, and had to reload by hand (2026-10-08). A real reload
 * always shows the database as it is now. Scroll position comes back through
 * <ReloadScrollRestore> and open gigs through the projects page's own memory,
 * so the admin lands where they were.
 */
export const RELOAD_SCROLL_KEY = 'podium:reload-scroll'
export const DASHBOARD_SCROLLER_ID = 'dashboard-main'

export function reloadPage(): void {
  if (typeof window === 'undefined') return
  try {
    const scroller = document.getElementById(DASHBOARD_SCROLLER_ID)
    sessionStorage.setItem(
      RELOAD_SCROLL_KEY,
      JSON.stringify({ path: window.location.pathname + window.location.search, top: scroller?.scrollTop ?? window.scrollY })
    )
  } catch {
    // Private mode or storage blocked: reload anyway, just without the scroll spot.
  }
  window.location.reload()
}
