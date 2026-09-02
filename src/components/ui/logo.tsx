import { cn } from '@/lib/utils'

interface LogoProps {
  variant?: 'light' | 'dark'
  className?: string
  size?: 'sm' | 'md' | 'lg'
  name?: string
}

/**
 * Podium logo — single italic monogram with gold accent bar.
 * Uses the actual Next.js-loaded Playfair Display font.
 *
 * - "light" = cream/gold for dark backgrounds (sidebar, auth panel)
 * - "dark"  = navy/brass for light backgrounds (mobile auth)
 *
 * `name` swaps the wordmark/monogram for other verticals' brands (e.g.
 * "Overhire"); it defaults to "Podium" so existing callers render unchanged.
 */
export function Logo({ variant = 'light', className, size = 'md', name = 'Podium' }: LogoProps) {
  const isLight = variant === 'light'

  const sizes = {
    sm: { monogram: 'text-5xl', wordmark: 'text-[9px] tracking-[0.18em]', bar: 'w-8 mt-1', gap: 'mt-1' },
    md: { monogram: 'text-6xl', wordmark: 'text-[11px] tracking-[0.2em]', bar: 'w-10 mt-1.5', gap: 'mt-1.5' },
    lg: { monogram: 'text-7xl', wordmark: 'text-xs tracking-[0.22em]', bar: 'w-12 mt-2', gap: 'mt-2' },
  }

  const s = sizes[size]

  return (
    <div
      className={cn('flex flex-col items-center select-none', className)}
      role="img"
      aria-label={name}
    >
      <span
        className={cn(
          'font-heading italic leading-none',
          s.monogram,
          isLight ? 'text-[#F5F0E8]' : 'text-[#1E293B]'
        )}
      >
        {name[0]}
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
        {name.toUpperCase()}
      </span>
    </div>
  )
}
