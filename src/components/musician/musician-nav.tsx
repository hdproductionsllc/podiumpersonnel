'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Calendar, Mail, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  {
    label: 'Home',
    href: '/musician',
    icon: Home,
  },
  {
    label: 'Schedule',
    href: '/musician/schedule',
    icon: Calendar,
  },
  {
    label: 'Offers',
    href: '/musician/offers',
    icon: Mail,
  },
  {
    label: 'Profile',
    href: '/musician/profile',
    icon: User,
  },
]

interface MusicianNavProps {
  pendingOffersCount?: number
}

export function MusicianNav({ pendingOffersCount = 0 }: MusicianNavProps) {
  const pathname = usePathname()

  return (
    <>
      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background md:hidden">
        <div className="flex h-16 items-center justify-around">
          {navItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/musician' && pathname.startsWith(item.href))
            const Icon = item.icon
            const showBadge = item.href === '/musician/offers' && pendingOffersCount > 0

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 px-3 py-2 min-w-[64px] relative',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <div className="relative">
                  <Icon className="h-5 w-5" />
                  {showBadge && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
                      {pendingOffersCount > 9 ? '9+' : pendingOffersCount}
                    </span>
                  )}
                </div>
                <span className="text-xs">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Desktop Side Rail */}
      <nav className="hidden md:flex fixed left-0 top-0 bottom-0 z-40 w-60 flex-col border-r bg-background">
        <div className="flex h-16 items-center border-b px-6">
          <Link href="/musician" className="flex items-center gap-2">
            <div className="rounded-lg bg-primary p-1.5">
              <svg
                className="h-5 w-5 text-primary-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
            </div>
            <span className="font-semibold">Musician Portal</span>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          <div className="space-y-1 px-3">
            {navItems.map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== '/musician' && pathname.startsWith(item.href))
              const Icon = item.icon
              const showBadge = item.href === '/musician/offers' && pendingOffersCount > 0

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors relative',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                  {showBadge && (
                    <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs font-medium text-destructive-foreground">
                      {pendingOffersCount > 9 ? '9+' : pendingOffersCount}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </div>

        <div className="border-t p-4">
          <p className="text-xs text-muted-foreground text-center">
            Powered by Podium
          </p>
        </div>
      </nav>
    </>
  )
}
