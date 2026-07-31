'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Logo } from '@/components/ui/logo'
import { usePlan } from '@/components/providers/plan-provider'
import { useOrgFlags } from '@/components/providers/org-flags-provider'
import { useVertical } from '@/components/providers/vertical-provider'
import { NAV_ROUTES } from '@/lib/verticals'
import type { NavItemId } from '@/lib/verticals'

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  )
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
    </svg>
  )
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  )
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </svg>
  )
}

function MusicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13" />
      <circle cx="6" cy="19" r="3" fill="none" />
      <circle cx="18" cy="16" r="3" fill="none" />
    </svg>
  )
}

function EnvelopeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
    </svg>
  )
}

function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
    </svg>
  )
}

function CurrencyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  )
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  )
}

// Icon per nav id. Labels/order/visibility come from the active vertical's nav
// config; routes come from NAV_ROUTES. Both are stable across verticals — only
// the wording changes, so the same sidebar structure serves every org type.
function LibraryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </svg>
  )
}

const NAV_ICONS: Record<NavItemId, typeof HomeIcon> = {
  dashboard: HomeIcon,
  projects: FolderIcon,
  musicians: UsersIcon,
  books: BookIcon,
  payments: CurrencyIcon,
  venues: MapPinIcon,
  instruments: MusicIcon,
  emails: EnvelopeIcon,
}

function SidebarPlanIndicator() {
  const plan = usePlan()

  if (plan.status === 'trial' && plan.trialDaysRemaining !== null) {
    return (
      <div className="mt-2 px-3">
        <p className="text-xs text-sidebar-foreground/40 text-center">
          Pro Trial &mdash; {plan.trialDaysRemaining}d left
        </p>
      </div>
    )
  }

  if (plan.status === 'free') {
    return (
      <div className="mt-2 px-3">
        <Link
          href="/dashboard/settings?billing=upgrade"
          className="flex items-center justify-center gap-1.5 rounded-md bg-sidebar-primary/10 px-3 py-1.5 text-xs font-medium text-sidebar-primary hover:bg-sidebar-primary/20 transition-colors"
        >
          Upgrade to Pro
        </Link>
      </div>
    )
  }

  return null
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const { nav } = useVertical()
  // Rendered outside the vertical's NavConfig on purpose. The library follows the
  // intake flag, not the org's vertical, and the default nav is frozen
  // string-for-string by vertical-identity.test.ts — adding an item there would
  // break the no-op guarantee for every existing org.
  const { intakeEnabled } = useOrgFlags()

  const items = nav.map(({ id, label, emphasize }) => ({
    name: label,
    href: NAV_ROUTES[id],
    icon: NAV_ICONS[id],
    emphasize: emphasize ?? false,
  }))

  return (
    <>
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {items.map((item) => {
          const isActive = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Button
              key={item.name}
              variant="ghost"
              className={cn(
                'w-full justify-start text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors',
                isActive && 'bg-sidebar-accent text-sidebar-primary font-semibold border-l-2 border-sidebar-primary rounded-l-none shadow-[inset_0_0_12px_rgb(196_145_90_/_0.08)]',
                !isActive && item.emphasize && 'font-semibold text-sidebar-primary'
              )}
              asChild
              onClick={onNavigate}
            >
              <Link href={item.href}>
                <item.icon className={cn('mr-3 h-5 w-5', isActive && 'text-sidebar-primary')} />
                {item.name}
              </Link>
            </Button>
          )
        })}

        {intakeEnabled && (() => {
          const isActive = pathname === '/dashboard/library' || pathname.startsWith('/dashboard/library/')
          return (
            <Button
              variant="ghost"
              className={cn(
                'w-full justify-start text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors',
                isActive && 'bg-sidebar-accent text-sidebar-primary font-semibold border-l-2 border-sidebar-primary rounded-l-none shadow-[inset_0_0_12px_rgb(196_145_90_/_0.08)]'
              )}
              asChild
              onClick={onNavigate}
            >
              <Link href="/dashboard/library">
                <LibraryIcon className={cn('mr-3 h-5 w-5', isActive && 'text-sidebar-primary')} />
                Music Library
              </Link>
            </Button>
          )
        })()}
      </nav>
      <div className="px-3 pb-4">
        <Separator className="mb-3 bg-sidebar-border/50" />
        {(() => {
          const isActive = pathname === '/dashboard/settings' || pathname.startsWith('/dashboard/settings/')
          return (
            <Button
              variant="ghost"
              className={cn(
                'w-full justify-start text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors',
                isActive && 'bg-sidebar-accent text-sidebar-primary font-semibold border-l-2 border-sidebar-primary rounded-l-none shadow-[inset_0_0_12px_rgb(196_145_90_/_0.08)]'
              )}
              asChild
              onClick={onNavigate}
            >
              <Link href="/dashboard/settings">
                <SettingsIcon className={cn('mr-3 h-5 w-5', isActive && 'text-sidebar-primary')} />
                Settings
              </Link>
            </Button>
          )
        })()}
        <SidebarPlanIndicator />
      </div>
    </>
  )
}

export function Sidebar() {
  return (
    <aside className="hidden md:flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-36 items-center justify-center px-4">
        <Link href="/dashboard">
          <Logo variant="light" size="lg" />
        </Link>
      </div>
      <Separator className="bg-sidebar-border" />
      <SidebarNav />
    </aside>
  )
}
