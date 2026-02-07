import { cn } from '@/lib/utils'

interface LogoProps {
  variant?: 'light' | 'dark'
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Podium logo using plain HTML + Tailwind font classes.
 * Uses the actual Next.js-loaded Playfair Display font.
 *
 * - "light" = cream/gold for dark backgrounds (sidebar, auth panel)
 * - "dark"  = navy/brass for light backgrounds (mobile auth)
 */
export function Logo({ variant = 'light', className, size = 'md' }: LogoProps) {
  const isLight = variant === 'light'

  const sizes = {
    sm: { monogram: 'text-4xl', wordmark: 'text-[10px] tracking-[0.25em]', bar: 'w-10 mt-2', gap: 'mt-1.5' },
    md: { monogram: 'text-5xl', wordmark: 'text-xs tracking-[0.3em]', bar: 'w-14 mt-3', gap: 'mt-2' },
    lg: { monogram: 'text-6xl', wordmark: 'text-sm tracking-[0.35em]', bar: 'w-16 mt-3.5', gap: 'mt-2.5' },
  }

  const s = sizes[size]

  return (
    <div
      className={cn('flex flex-col items-center select-none', className)}
      role="img"
      aria-label="Podium"
    >
      <span
        className={cn(
          'font-heading italic leading-tight',
          s.monogram,
          isLight ? 'text-[#F5F0E8]' : 'text-[#1E293B]'
        )}
      >
        pp
      </span>
      <div
        className={cn(
          'h-[1.5px] rounded-full bg-[#C4915A]',
          s.bar
        )}
      />
      <span
        className={cn(
          'font-heading leading-none',
          s.wordmark,
          s.gap,
          isLight ? 'text-[#F5F0E8]' : 'text-[#1E293B]'
        )}
      >
        PODIUM
      </span>
    </div>
  )
}
