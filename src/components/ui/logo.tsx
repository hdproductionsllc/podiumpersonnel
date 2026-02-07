import { cn } from '@/lib/utils'

interface LogoProps {
  variant?: 'light' | 'dark'
  className?: string
}

/**
 * Podium logo as inline SVG — renders reliably everywhere
 * (no font dependency issues like <img> + SVG text).
 *
 * - "light" = cream/gold text for dark backgrounds (sidebar, auth panel)
 * - "dark"  = navy/brass text for light backgrounds (mobile auth)
 */
export function Logo({ variant = 'light', className }: LogoProps) {
  const textColor = variant === 'light' ? '#F5F0E8' : '#1E293B'
  const accentColor = '#C4915A'

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 220 100"
      className={cn('select-none', className)}
      role="img"
      aria-label="Podium"
    >
      {/* "pp" monogram — italic serif */}
      <g transform="translate(110, 52)" textAnchor="middle">
        <text
          x="0"
          y="0"
          fontFamily="'Playfair Display', Georgia, 'Times New Roman', serif"
          fontSize="52"
          fontStyle="italic"
          fontWeight="400"
          fill={textColor}
          letterSpacing="-1"
        >
          pp
        </text>
      </g>

      {/* Brass accent bar */}
      <rect x="78" y="60" width="64" height="1.5" rx="0.75" fill={accentColor} />

      {/* PODIUM wordmark — tracked uppercase */}
      <g transform="translate(113, 82)" textAnchor="middle">
        <text
          x="0"
          y="0"
          fontFamily="'Playfair Display', Georgia, 'Times New Roman', serif"
          fontSize="14"
          fontWeight="400"
          fill={textColor}
          letterSpacing="5"
        >
          PODIUM
        </text>
      </g>
    </svg>
  )
}
